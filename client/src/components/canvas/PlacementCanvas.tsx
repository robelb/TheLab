/**
 * Drag the logo and any wording onto the product, instead of describing where
 * you want them and hoping.
 *
 * Deliberately NOT a `<canvas>`. Exporting one means `toDataURL()`, which taints
 * on any image the browser fetched without CORS headers — and brand logos here
 * are arbitrary URLs scraped off customer websites, most of which send none. So
 * this is plain DOM: absolutely-positioned layers over the photo, CSS
 * transforms, and the flattening done server-side by `composeLayout`, which can
 * fetch what the browser cannot. It also means inline-SVG logos render natively
 * and no new dependency was needed for drag, scale or rotate.
 *
 * Every coordinate is a fraction of the base image's own box — see
 * `types/layout.ts` for why that matters and what it costs to get wrong.
 */

import {
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  Copy,
  Lock,
  LockOpen,
  Maximize,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import {
  clamp,
  duplicateLayer,
  MAX_LAYER_WIDTH,
  MAX_LAYERS,
  MIN_LAYER_WIDTH,
  MAX_TEXT_LENGTH,
  removeLayer,
  snap,
  updateLayer,
} from '@/lib/layout'
import { sanitizeSvgMarkup } from '@/lib/logo'
import { cn } from '@/lib/utils'
import { FONT_STYLES, type FontStyle, type PlacementLayer, type PlacementLayout } from '@/types/layout'

export interface CanvasLogo {
  kind: 'url' | 'data-uri' | 'svg'
  value: string
}

interface PlacementCanvasProps {
  baseImage: string | null
  logo?: CanvasLogo | null
  layout: PlacementLayout
  onChange: (layout: PlacementLayout) => void
  disabled?: boolean
  /** Overlaid while a render is in flight. */
  busy?: React.ReactNode
  className?: string
  /**
   * `square` keeps the canvas in a 1:1 box — right for a side panel, where the
   * space is fixed. `fill` lets it take whatever the parent gives it, which is
   * what the full-screen editor wants.
   */
  fit?: 'square' | 'fill'
  /**
   * Selection can be driven from outside when the host renders its own layer
   * list, so clicking a row in the rail and clicking the layer itself stay in
   * agreement. Left alone, the canvas tracks selection on its own.
   */
  selectedId?: string | null
  onSelectedIdChange?: (id: string | null) => void
  /** Set false when the host renders the properties strip somewhere roomier. */
  showControls?: boolean
  /** Offer zoom and pan. Only the roomy full-screen editor wants this. */
  zoomable?: boolean
  /**
   * Fired once per completed gesture — a released drag, a settled run of
   * keyboard nudges. `onChange` fires on every pointermove, which is the right
   * granularity for rendering and the wrong one for undo: a host that
   * snapshotted every frame would need forty presses to undo one drag.
   */
  onCommit?: () => void
}

/**
 * Kept identical to `FONT_FAMILIES` in the server's `composeLayout`, so the
 * canvas and the mockup ask for the same faces in the same order.
 *
 * `script` names real faces rather than the CSS generic. The server's SVG
 * renderer has no `cursive` generic and silently fell through to serif, so
 * Script wording looked like Script here and like Serif in the mockup people
 * actually confirmed. The generic stays on the end as a last resort.
 *
 * The two will still resolve to different faces on hosts with different fonts
 * installed — acceptable, because this text is a placement hint that the image
 * model re-typesets as real print. It only has to agree on where the wording
 * sits and how wide it runs.
 */
const FONT_STACKS: Record<FontStyle, string> = {
  sans: 'sans-serif',
  serif: 'serif',
  script:
    "Snell Roundhand, 'Apple Chancery', 'URW Chancery L', Z003, 'Comic Sans MS', cursive",
  mono: 'monospace',
}

const FONT_LABELS: Record<FontStyle, string> = {
  sans: 'Sans',
  serif: 'Serif',
  script: 'Script',
  mono: 'Mono',
}

/**
 * The colour a text layer prints in when nobody has picked one.
 *
 * Must match `safeColor`'s fallback in the server's `composeLayout`, or a layer
 * with no colour of its own previews in one near-black and prints in another.
 */
export const DEFAULT_TEXT_COLOR = '#1f2933'

/** Text is measured once at this size, then scaled — see `textMetrics`. */
const MEASURE_FONT_PX = 100

/** Line spacing for multi-line wording. Mirrors `LINE_HEIGHT_EM` on the server. */
const LINE_HEIGHT = 1.2

/**
 * Where a piece of wording's INK sits, in the span's own pixels at
 * `MEASURE_FONT_PX` — not the line box it is laid out in.
 *
 * The distinction is the whole reason this type exists. A line box is as wide
 * as the text advances (side bearings and the trailing space of the last glyph
 * included) and as tall as the leading, whether or not any letter reaches into
 * it. The server crops its render to the ink and scales THAT to the layer's
 * width, so measuring the line box here meant the same layer came out some 5%
 * smaller in the editor than in the mockup, and sitting a little high — higher
 * still for wording with no descenders, lower for wording that was all
 * descenders, because the two boxes have different centres.
 *
 * Nobody could point at the cause; it just looked like the mockup had moved
 * things. Measuring the ink is what makes the placement canvas and the flat
 * mockup describe the same rectangle.
 */
interface TextInk {
  /** Offset of the ink from the span's top-left, at `MEASURE_FONT_PX`. */
  left: number
  top: number
  width: number
  height: number
}

/**
 * One canvas for every measurement ever taken.
 *
 * `measureText` is the only way to the ink extents of a glyph run — the DOM
 * reports advances and line boxes and nothing else — and a fresh 2D context per
 * keystroke is a real cost when the wording is being typed on the product.
 */
let measuringContext: CanvasRenderingContext2D | null | undefined
function textMeasurer(): CanvasRenderingContext2D | null {
  if (measuringContext === undefined) {
    measuringContext =
      typeof document === 'undefined'
        ? null
        : document.createElement('canvas').getContext('2d')
  }
  return measuringContext
}

/**
 * The ink box of a layer's wording, given where the DOM put its first baseline.
 *
 * Only the baseline comes from the DOM, because where the browser put it is a
 * fact about its own layout rather than something to predict from font metrics.
 * Everything else is measured here: how wide each line advances — which is the
 * span's own shrink-to-fit width, and so where `text-center` centres it — and
 * how far the ink reaches from that centre and that baseline.
 *
 * Taking the width from the same place as the ink rather than from the
 * measuring div keeps the two in one coordinate system, and leaves that div
 * free to hold the baseline marker without its own width becoming load-bearing.
 *
 * Null when the run has no ink at all — whitespace, or wording that has just
 * been emptied. The server's `trim` fails on exactly the same input, so the two
 * agree that there is no layer to draw rather than disagreeing about its size.
 */
function measureInk(
  layer: PlacementLayer,
  firstBaseline: number,
): TextInk | null {
  const lines = (layer.text ?? '').split('\n')
  const ctx = textMeasurer()
  if (!ctx) return null

  ctx.font = `${layer.fontWeight === 'bold' ? 'bold' : 'normal'} ${MEASURE_FONT_PX}px ${
    FONT_STACKS[layer.fontStyle ?? 'sans']
  }`
  // Both ends of the pipeline centre each line on the same anchor — `text-center`
  // here, `text-anchor="middle"` in the server's SVG — so the ink offsets have
  // to be read from the centre too, or a short line in a multi-line block would
  // be measured as if it started at the left edge.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  const measured = lines.map((line) => ctx.measureText(line))
  const centre = Math.max(...measured.map((m) => m.width)) / 2
  if (!(centre > 0)) return null

  if (measured[0].actualBoundingBoxAscent === undefined) {
    // No ink extents to be had: fall back to the line box, which is what this
    // measured before. Slightly off the mockup, rather than not drawn at all.
    return {
      left: 0,
      top: 0,
      width: centre * 2,
      height: MEASURE_FONT_PX * LINE_HEIGHT * lines.length,
    }
  }

  let left = Infinity
  let right = -Infinity
  let top = Infinity
  let bottom = -Infinity
  measured.forEach((m, i) => {
    // A blank line has a baseline but no ink. Counting it would stretch the box
    // to a line nobody can see; the server's trim passes straight over it.
    if (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent <= 0) return
    const baseline = firstBaseline + i * MEASURE_FONT_PX * LINE_HEIGHT
    left = Math.min(left, centre - m.actualBoundingBoxLeft)
    right = Math.max(right, centre + m.actualBoundingBoxRight)
    top = Math.min(top, baseline - m.actualBoundingBoxAscent)
    bottom = Math.max(bottom, baseline + m.actualBoundingBoxDescent)
  })

  if (!(right > left) || !(bottom > top)) return null
  return { left, top, width: right - left, height: bottom - top }
}

/**
 * Put a span where its ink lands on the layer's box.
 *
 * Translate before scale, with the offsets already in scaled pixels: the
 * transform origin is the span's top-left, so this maps the ink's corner onto
 * the box's corner and leaves the type size to `scale`.
 */
function inkTransform(
  draw: { scale: number; left: number; top: number } | null | undefined,
): string {
  if (!draw) return 'scale(1)'
  return `translate(${draw.left}px, ${draw.top}px) scale(${draw.scale})`
}

/**
 * How far a press may wander and still count as a click.
 *
 * A press on empty canvas means two things at once: deselect, and start panning
 * when zoomed. Which one it turns out to be is only knowable at pointer-up, so
 * the gesture is measured rather than guessed.
 */
const CLICK_SLOP_PX = 4

/** How close to a guide a drag has to come, in pixels, before it snaps. */
const SNAP_PX = 6

/** Every logo layer draws the same supplied mark, so they share one measurement. */
const LOGO_ASPECT_KEY = '__logo__'

/** A run of arrow-key nudges settles into one undo step after this long. */
const NUDGE_COMMIT_MS = 400

/**
 * Two presses on the same wording this close together open it for editing.
 *
 * Measured here rather than left to `dblclick`, which never arrives: starting
 * a drag calls `preventDefault()` on `pointerdown`, and that suppresses the
 * compatibility mouse events — `mousedown`, `click` and `dblclick` with them.
 * Every double-click on a layer was therefore swallowed by the drag it also
 * began, so the gesture is timed from the pointer events we already handle.
 */
const DOUBLE_PRESS_MS = 350

const NUDGE = 0.004
const NUDGE_COARSE = 0.02

/** What a screen reader announces for a layer, and how it can be moved. */
function layerLabel(layer: PlacementLayer): string {
  const what =
    layer.kind === 'logo'
      ? 'Brand logo'
      : layer.kind === 'image'
        ? 'Artwork'
        : `Text “${layer.text}”`
  if (layer.locked) return `${what} — locked`
  const how =
    layer.kind === 'text'
      ? 'drag to move, arrow keys to nudge, Enter or double-click to edit the wording'
      : 'drag to move, arrow keys to nudge'
  return `${what} — ${how}`
}

/** The image's content box inside the frame, once `object-contain` has letterboxed it. */
interface ContentBox {
  left: number
  top: number
  width: number
  height: number
}

type DragMode = 'move' | 'scale' | 'rotate'

interface DragState {
  id: string
  mode: DragMode
  /** Frame geometry captured at pointerdown — the dialog cannot resize mid-drag. */
  frame: DOMRect
  box: ContentBox
  startX: number
  startY: number
  layer: PlacementLayer
  startAngle: number
  startDistance: number
}

export function PlacementCanvas({
  baseImage,
  logo,
  layout,
  onChange,
  disabled,
  busy,
  className,
  fit = 'square',
  selectedId: controlledId,
  onSelectedIdChange,
  showControls = true,
  zoomable = false,
  onCommit,
}: PlacementCanvasProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Arrow keys have no "release", so a run of them settles into one step.
  const commitAfterNudge = useCallback(() => {
    if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current)
    nudgeTimerRef.current = setTimeout(() => {
      nudgeTimerRef.current = null
      onCommit?.()
    }, NUDGE_COMMIT_MS)
  }, [onCommit])

  useEffect(
    () => () => {
      if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current)
    },
    [],
  )

  const [box, setBox] = useState<ContentBox | null>(null)
  // Zoom lives on the base image alone; layers sit in an untransformed overlay
  // and follow because their geometry is derived from the image's measured
  // rect. That keeps handles a constant size on screen and leaves every drag
  // calculation below untouched.
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const panRef = useRef<{
    x: number
    y: number
    startX: number
    startY: number
    /** Has this press travelled far enough to be a pan rather than a click? */
    moved: boolean
    /** Whether panning is even on the table — a click still deselects if not. */
    canPan: boolean
  } | null>(null)
  /**
   * The wording being typed straight onto the product, if any.
   *
   * Editing in place rather than only in the side panel, because the wording is
   * the one layer whose content is its shape: you cannot judge a line of text
   * against the photograph by looking at a field somewhere else and watching
   * something move in the corner of your eye. The panel's field stays — it is
   * still the way to work on a long line, and the only way that works without
   * a pointer.
   */
  const [editingId, setEditingId] = useState<string | null>(null)
  /**
   * How the caret got there, which decides where it lands.
   *
   * Opened by pointer, the browser puts the caret where the press was, and that
   * is the whole point of typing on the wording itself — you click into the
   * middle of a word and fix that word. Opened from the keyboard there is no
   * such point, so it goes to the end.
   */
  const editOpenedBy = useRef<'pointer' | 'keyboard'>('pointer')
  const editRef = useRef<HTMLSpanElement | null>(null)
  /** The last press, so a second one on the same wording can open it. */
  const lastPressRef = useRef<{ id: string; time: number } | null>(null)
  /**
   * How each piece of wording was last drawn: the scale, and the ink offset it
   * was nudged by.
   *
   * Deleting the last character leaves nothing to measure, so the computed
   * scale drops to zero and the caret would vanish with the glyphs — exactly
   * when the person is mid-edit and needs to see where they are typing. The
   * last good placement holds the empty box open where the wording just was.
   */
  const lastDrawRef = useRef<
    Record<string, { scale: number; left: number; top: number }>
  >({})
  /**
   * Per text layer: the wording's ink width the last time its span was
   * reconciled, and the span it was reconciled to. Together they pin the size
   * the glyphs are drawn at — see the rescale in the measuring effect.
   */
  const typeScaleRef = useRef<Record<string, { natural: number; width: number }>>(
    {},
  )
  const [uncontrolledId, setUncontrolledId] = useState<string | null>(null)
  const controlled = controlledId !== undefined
  const selectedId = controlled ? controlledId : uncontrolledId
  const setSelectedId = useCallback(
    (id: string | null) => {
      if (!controlled) setUncontrolledId(id)
      onSelectedIdChange?.(id)
    },
    [controlled, onSelectedIdChange],
  )
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  })
  /**
   * Which layer is being dragged, so the readout can be shown.
   *
   * `dragRef` cannot drive this — it is a ref precisely so a gesture does not
   * re-render, and the readout has to appear. One state flip per gesture, not
   * per frame.
   */
  const [dragging, setDragging] = useState<{ id: string; mode: DragMode } | null>(
    null,
  )
  // Ink box of each text layer at MEASURE_FONT_PX, keyed by layer id.
  const [textMetrics, setTextMetrics] = useState<Record<string, TextInk>>({})
  // Width ÷ height of each drawn mark. Most logos are wide wordmarks and
  // uploaded artwork is any shape at all; assuming square puts the selection
  // ring and its handles nowhere near the artwork. Logo layers share one entry
  // (they all draw the same supplied mark); image layers key by their URL.
  const [aspects, setAspects] = useState<Record<string, number>>({})

  const aspectKey = (layer: PlacementLayer) =>
    layer.kind === 'logo' ? LOGO_ASPECT_KEY : (layer.imageUrl ?? layer.id)

  const rememberAspect = useCallback((key: string, ratio: number) => {
    if (!Number.isFinite(ratio) || ratio <= 0) return
    setAspects((prev) =>
      Math.abs((prev[key] ?? 0) - ratio) < 0.001 ? prev : { ...prev, [key]: ratio },
    )
  }, [])

  const selected = layout.layers.find((l) => l.id === selectedId) ?? null

  // ── Geometry ──────────────────────────────────────────────────────────────
  // `object-contain` letterboxes the photo inside its element, and every
  // coordinate here is relative to the photo, not the element. Measuring the
  // element instead is the bug that makes a dragged logo land somewhere else in
  // the render — so the content box is derived from the natural aspect ratio.
  const measureBox = useCallback(() => {
    const frame = frameRef.current
    const img = imageRef.current
    if (!frame || !img || !img.naturalWidth || !img.naturalHeight) {
      setBox(null)
      return
    }
    const frameRect = frame.getBoundingClientRect()
    // Measured from the IMAGE's own rect rather than the frame's, because that
    // rect already reflects any zoom/pan transform on it. Every drag, snap and
    // handle calculation downstream is expressed against this box, so they all
    // keep working at any zoom without knowing zoom exists.
    const imgRect = img.getBoundingClientRect()
    if (!frameRect.width || !imgRect.width || !imgRect.height) return

    const natural = img.naturalWidth / img.naturalHeight
    const imgAspect = imgRect.width / imgRect.height
    const width = natural > imgAspect ? imgRect.width : imgRect.height * natural
    const height = natural > imgAspect ? imgRect.width / natural : imgRect.height

    setBox({
      left: imgRect.left - frameRect.left + (imgRect.width - width) / 2,
      top: imgRect.top - frameRect.top + (imgRect.height - height) / 2,
      width,
      height,
    })
  }, [])

  useLayoutEffect(() => {
    measureBox()
    const frame = frameRef.current
    if (!frame || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measureBox)
    observer.observe(frame)
    return () => observer.disconnect()
    // Zoom and pan move the image, so the content box has to be re-read.
  }, [measureBox, baseImage, zoom, pan])

  // Measure every text layer at a fixed size so it can be scaled to the width
  // the user set. Cheaper and steadier than guessing from glyph counts, and it
  // matches what the server does (render big, trim to the ink, scale to fit).
  useLayoutEffect(() => {
    const node = measureRef.current
    if (!node) return
    const next: Record<string, TextInk> = {}
    for (const child of Array.from(node.children)) {
      const el = child as HTMLElement
      const id = el.dataset.layerId
      if (!id) continue
      const layer = layout.layers.find((l) => l.id === id)
      // The marker is an empty inline-block sitting on the first baseline —
      // the only way to ask the DOM where it put that baseline.
      const marker = el.querySelector<HTMLElement>('[data-baseline]')
      if (!layer || !marker) continue
      const ink = measureInk(
        layer,
        marker.getBoundingClientRect().top - el.getBoundingClientRect().top,
      )
      if (ink) next[id] = ink
    }
    setTextMetrics((prev) => {
      const ids = Object.keys(next)
      const same =
        ids.length === Object.keys(prev).length &&
        ids.every(
          (id) =>
            prev[id] &&
            Math.abs(prev[id].left - next[id].left) < 0.5 &&
            Math.abs(prev[id].top - next[id].top) < 0.5 &&
            Math.abs(prev[id].width - next[id].width) < 0.5 &&
            Math.abs(prev[id].height - next[id].height) < 0.5,
        )
      return same ? prev : next
    })

    // Hold the type size still while the wording changes.
    //
    // A text layer stores only the span it covers, so the glyphs come out at
    // whatever size makes the wording fill that span: type a longer word and
    // the letters shrink, delete one and they grow. Nobody typing expects the
    // font to resize under them. So the span follows the wording instead —
    // rescaled in proportion to the width of its ink, which leaves the px-per-em
    // the glyphs are drawn at exactly where it was.
    //
    // Only for a span untouched since it was last reconciled. Dragging a
    // resize handle or moving the size slider IS a deliberate type-size
    // change; re-baselining on it is what stops this from undoing it.
    const baselines = typeScaleRef.current
    const live = new Set<string>()
    const resized: Record<string, number> = {}
    for (const layer of layout.layers) {
      if (layer.kind !== 'text') continue
      live.add(layer.id)
      // Emptied wording measures nothing. Keep the baseline rather than drop
      // it, so retyping comes back at the size it left at.
      const natural = next[layer.id]?.width
      if (!natural) continue
      const base = baselines[layer.id]
      const width =
        base && base.width === layer.width && Math.abs(base.natural - natural) > 0.5
          ? clamp(
              layer.width * (natural / base.natural),
              MIN_LAYER_WIDTH,
              MAX_LAYER_WIDTH,
            )
          : layer.width
      if (width !== layer.width) resized[layer.id] = width
      baselines[layer.id] = { natural, width }
    }
    for (const id of Object.keys(baselines)) {
      if (!live.has(id)) delete baselines[id]
    }

    if (Object.keys(resized).length) {
      onChange({
        layers: layout.layers.map((l) =>
          resized[l.id] === undefined ? l : { ...l, width: resized[l.id] },
        ),
      })
    }
  }, [layout.layers, onChange])

  // A new mark has a new shape; drop the stale measurement rather than
  // sizing the next one to the last one's box.
  useEffect(() => {
    setAspects((prev) => {
      if (!(LOGO_ASPECT_KEY in prev)) return prev
      const next = { ...prev }
      delete next[LOGO_ASPECT_KEY]
      return next
    })
  }, [logo?.value])

  // A layer removed elsewhere must not stay selected.
  useEffect(() => {
    if (selectedId && !layout.layers.some((l) => l.id === selectedId)) {
      setSelectedId(null)
    }
  }, [layout.layers, selectedId, setSelectedId])

  // ── Editing wording in place ──────────────────────────────────────────────

  /**
   * Open a piece of wording for typing.
   *
   * The layer is selected first and deliberately: the properties strip follows
   * selection, so the font, colour and size controls for the wording being
   * typed are on screen the whole time it is being typed.
   */
  const beginEdit = useCallback(
    (layer: PlacementLayer, via: 'pointer' | 'keyboard') => {
      if (disabled || layer.locked || layer.kind !== 'text') return
      editOpenedBy.current = via
      setSelectedId(layer.id)
      setEditingId(layer.id)
    },
    [disabled, setSelectedId],
  )

  /**
   * Stop typing — and throw the layer away if nothing is left of it.
   *
   * Emptying the wording is how someone deletes it from here, and the result
   * has to be no layer rather than an invisible one: a text layer with nothing
   * in it measures zero, so it cannot be seen, clicked or selected again, and
   * it would go on to describe itself to the image model as wording to print.
   */
  const finishEdit = useCallback(
    (id: string) => {
      setEditingId(null)
      const layer = layout.layers.find((l) => l.id === id)
      if (!layer) return
      if (!layer.text?.trim()) onChange(removeLayer(layout, id))
      onCommit?.()
    },
    [layout, onChange, onCommit],
  )

  const endEdit = useCallback(() => {
    if (editingId) finishEdit(editingId)
  }, [editingId, finishEdit])

  /**
   * Put the caret in, once, when editing starts.
   *
   * The content is written imperatively and the editable node is rendered with
   * no React children, which is what keeps typing possible at all: React
   * re-renders on every keystroke, and a node whose text it manages would have
   * its children patched and the caret thrown back to the start each time.
   *
   * Never selecting everything, so the first keystroke adds to the wording
   * instead of replacing it — and Backspace still does what someone who came
   * here to delete a word expects.
   */
  useEffect(() => {
    const node = editRef.current
    if (!editingId || !node) return
    const layer = layout.layers.find((l) => l.id === editingId)
    node.textContent = layer?.text ?? ''
    node.focus({ preventScroll: true })
    // Opened by pointer, the caret is left alone: the press that opened this
    // is still to have its say, and where it fell is where the person meant to
    // type. Forcing it to the end here fought that and won, which made
    // clicking into the middle of a word impossible.
    const selection = window.getSelection()
    if (selection && editOpenedBy.current === 'keyboard') {
      const range = document.createRange()
      range.selectNodeContents(node)
      range.collapse(false)
      selection.removeAllRanges()
      selection.addRange(range)
    }
    // Only when editing opens. Re-running on `layout` would rewrite the node
    // from state mid-word and undo the very thing this exists to prevent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId])

  /**
   * Nothing stays open that cannot be typed into: a layer deleted from the
   * rail, a render starting, or the selection moving to something else.
   *
   * It goes through `finishEdit` rather than just closing, because leaving
   * this way is as likely as any other. Clicking straight from emptied wording
   * onto a different layer never blurs the editable — the press that moves the
   * selection is `preventDefault`ed to start a drag — so closing without
   * finishing left exactly the invisible empty layer `finishEdit` exists to
   * clear.
   */
  useEffect(() => {
    if (!editingId) return
    const layer = layout.layers.find((l) => l.id === editingId)
    if (!layer) return setEditingId(null)
    if (layer.locked || disabled || selectedId !== editingId) {
      finishEdit(editingId)
    }
  }, [editingId, layout.layers, disabled, selectedId, finishEdit])

  /**
   * Read the node back into the layout.
   *
   * `innerText` is what turns the browser's own line breaks — a `<br>`, or a
   * wrapping div — into `\n`, which is the one form both renderers lay out on.
   *
   * The length cap is enforced here rather than only on the way in, because
   * `onBeforeInput` can only refuse the next keystroke: one paste or dictated
   * phrase arrives as a single insertion and sails past a limit it was under
   * when it started. The server's schema does not truncate an over-long line,
   * it rejects the whole layout — so wording typed here has to be incapable of
   * exceeding it. When the cap bites, the node is put back in step with what
   * was actually kept, or the two would disagree about the wording from then on.
   */
  const onEditInput = (layer: PlacementLayer, node: HTMLElement) => {
    const typed = node.innerText.replace(/\n$/, '')
    const text = typed.slice(0, MAX_TEXT_LENGTH)
    if (text !== typed) {
      node.textContent = text
      const selection = window.getSelection()
      if (selection) {
        const range = document.createRange()
        range.selectNodeContents(node)
        range.collapse(false)
        selection.removeAllRanges()
        selection.addRange(range)
      }
    }
    onChange(updateLayer(layout, layer.id, { text }))
  }

  /**
   * On-screen size of a layer, in frame pixels.
   *
   * For wording this is the box its INK fills, which is what `layer.width`
   * means everywhere else — the compositor crops to the ink before scaling, and
   * the prompt tells the image model the wording spans that much of the photo.
   * Sizing to the line box instead left the selection ring standing off the
   * letters and the mockup disagreeing with the canvas about both.
   */
  const layerSize = (layer: PlacementLayer, content: ContentBox) => {
    const width = layer.width * content.width
    if (layer.kind !== 'text') {
      return { width, height: width / (aspects[aspectKey(layer)] ?? 1) }
    }
    const metric = textMetrics[layer.id]
    const ratio = metric && metric.width > 0 ? metric.height / metric.width : 0.3
    return { width, height: width * ratio }
  }

  // ── Pointer handling ──────────────────────────────────────────────────────
  const centreOf = (layer: PlacementLayer, drag: DragState) => ({
    x: drag.frame.left + drag.box.left + layer.x * drag.box.width,
    y: drag.frame.top + drag.box.top + layer.y * drag.box.height,
  })

  const beginDrag = (
    event: React.PointerEvent,
    layer: PlacementLayer,
    mode: DragMode,
  ) => {
    if (disabled || !box) return
    // A locked layer still selects — that is how you reach the unlock button —
    // it just does not move.
    if (layer.locked) {
      event.stopPropagation()
      setSelectedId(layer.id)
      return
    }

    // A second press on the same wording opens it for typing instead of
    // starting another drag. `stopPropagation` so the frame does not treat it
    // as a press on empty canvas and deselect on release — but NOT
    // `preventDefault`, because the caret has to be allowed to land.
    if (mode === 'move' && layer.kind === 'text') {
      const last = lastPressRef.current
      const now = Date.now()
      lastPressRef.current = { id: layer.id, time: now }
      if (last?.id === layer.id && now - last.time < DOUBLE_PRESS_MS) {
        lastPressRef.current = null
        event.stopPropagation()
        beginEdit(layer, 'pointer')
        return
      }
    }

    const frame = frameRef.current?.getBoundingClientRect()
    if (!frame) return

    event.preventDefault()
    event.stopPropagation()
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    setSelectedId(layer.id)
    setDragging({ id: layer.id, mode })

    const centre = {
      x: frame.left + box.left + layer.x * box.width,
      y: frame.top + box.top + layer.y * box.height,
    }
    dragRef.current = {
      id: layer.id,
      mode,
      frame,
      box,
      startX: event.clientX,
      startY: event.clientY,
      layer,
      startAngle:
        (Math.atan2(event.clientY - centre.y, event.clientX - centre.x) * 180) /
        Math.PI,
      startDistance: Math.hypot(
        event.clientX - centre.x,
        event.clientY - centre.y,
      ),
    }
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    event.preventDefault()
    const { layer, box: content } = drag

    if (drag.mode === 'move') {
      const rawX = layer.x + (event.clientX - drag.startX) / content.width
      const rawY = layer.y + (event.clientY - drag.startY) / content.height
      // Shift is the escape hatch from the guides, not a modifier for them.
      const threshold = event.shiftKey ? 0 : SNAP_PX
      const snappedX = snap(clamp(rawX, 0, 1), threshold / content.width)
      const snappedY = snap(clamp(rawY, 0, 1), threshold / content.height)
      setGuides({ x: snappedX.guide, y: snappedY.guide })
      onChange(updateLayer(layout, layer.id, { x: snappedX.value, y: snappedY.value }))
      return
    }

    const centre = centreOf(layer, drag)
    if (drag.mode === 'scale') {
      const distance = Math.hypot(event.clientX - centre.x, event.clientY - centre.y)
      if (drag.startDistance < 1) return
      const width = clamp(
        (layer.width * distance) / drag.startDistance,
        MIN_LAYER_WIDTH,
        MAX_LAYER_WIDTH,
      )
      onChange(updateLayer(layout, layer.id, { width }))
      return
    }

    const angle =
      (Math.atan2(event.clientY - centre.y, event.clientX - centre.x) * 180) / Math.PI
    let rotation = (layer.rotation ?? 0) + (angle - drag.startAngle)
    // Shift steps in 15° detents — the tilts anyone actually wants.
    if (event.shiftKey) rotation = Math.round(rotation / 15) * 15
    rotation = ((((rotation + 180) % 360) + 360) % 360) - 180
    onChange(updateLayer(layout, layer.id, { rotation: Math.round(rotation) }))
  }

  const endDrag = (event: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const target = event.currentTarget as HTMLElement
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId)
    }
    const before = drag.layer
    const after = layout.layers.find((l) => l.id === drag.id)
    dragRef.current = null
    setDragging(null)
    setGuides({ x: null, y: null })
    // One gesture, one undo step — but only when the gesture moved something.
    // A press that selects and nothing more used to push a step too, so a few
    // stray clicks filled the history with no-ops and ⌘Z looked broken.
    const moved =
      !after ||
      after.x !== before.x ||
      after.y !== before.y ||
      after.width !== before.width ||
      (after.rotation ?? 0) !== (before.rotation ?? 0)
    if (moved) onCommit?.()
  }

  /** The numbers for the gesture in flight: position while moving, else size or angle. */
  const draggedLayer = dragging
    ? layout.layers.find((l) => l.id === dragging.id)
    : undefined
  const dragReadout = !draggedLayer
    ? null
    : dragging?.mode === 'scale'
      ? `${Math.round(draggedLayer.width * 100)}%`
      : dragging?.mode === 'rotate'
        ? `${Math.round(draggedLayer.rotation ?? 0)}°`
        : `${Math.round(draggedLayer.x * 100)}% · ${Math.round(draggedLayer.y * 100)}%`

  const resetView = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  // A new subject should not inherit the last one's viewport.
  useEffect(() => {
    resetView()
  }, [baseImage, resetView])

  const applyZoom = (next: number, origin?: { x: number; y: number }) => {
    const clamped = clamp(next, 1, 4)
    setZoom((current) => {
      if (clamped === current) return current
      // Keep whatever is under the cursor under the cursor.
      if (origin) {
        const factor = clamped / current
        setPan((p) => ({
          x: origin.x - (origin.x - p.x) * factor,
          y: origin.y - (origin.y - p.y) * factor,
        }))
      }
      if (clamped === 1) setPan({ x: 0, y: 0 })
      return clamped
    })
  }

  const onWheel = (event: React.WheelEvent) => {
    if (!zoomable || disabled) return
    const frame = frameRef.current
    if (!frame) return
    // Modifier + wheel zooms — a bare wheel still scrolls the page, which is
    // what people expect until they ask for zoom.
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      const rect = frame.getBoundingClientRect()
      applyZoom(zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12), {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2,
      })
    } else if (zoom > 1) {
      event.preventDefault()
      setPan((p) => ({ x: p.x - event.deltaX, y: p.y - event.deltaY }))
    }
  }

  const beginPan = (event: React.PointerEvent) => {
    // Every press on empty canvas is recorded, even when panning is off: a
    // press that never travels is a deselect, and that has to work at 100% too.
    if (disabled) return
    panRef.current = {
      x: pan.x,
      y: pan.y,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      canPan: Boolean(zoomable) && zoom > 1,
    }
  }

  const onFramePointerMove = (event: React.PointerEvent) => {
    const p = panRef.current
    if (!p) return
    const dx = event.clientX - p.startX
    const dy = event.clientY - p.startY
    // A few pixels of tremor is still a click, not a pan.
    if (!p.moved && Math.hypot(dx, dy) > CLICK_SLOP_PX) p.moved = true
    if (p.moved && p.canPan) setPan({ x: p.x + dx, y: p.y + dy })
  }

  const endPan = () => {
    const p = panRef.current
    panRef.current = null
    if (!p) return
    // Deselect on a click, not on a pan. Clearing at pointerdown meant every
    // attempt to reposition the photo also dropped whatever you were working on.
    if (!p.moved) setSelectedId(null)
  }

  const onLayerKeyDown = (event: React.KeyboardEvent, layer: PlacementLayer) => {
    if (disabled || layer.locked) return
    // While typing, the keyboard belongs to the caret. Arrow keys move through
    // the wording and Backspace deletes a character — not the layer.
    if (editingId === layer.id) return
    if (
      layer.kind === 'text' &&
      (event.key === 'Enter' || event.key === 'F2')
    ) {
      event.preventDefault()
      return beginEdit(layer, 'keyboard')
    }
    const step = event.shiftKey ? NUDGE_COARSE : NUDGE
    const move = (dx: number, dy: number) => {
      event.preventDefault()
      onChange(
        updateLayer(layout, layer.id, {
          x: clamp(layer.x + dx, 0, 1),
          y: clamp(layer.y + dy, 0, 1),
        }),
      )
      commitAfterNudge()
    }
    switch (event.key) {
      case 'ArrowLeft':
        return move(-step, 0)
      case 'ArrowRight':
        return move(step, 0)
      case 'ArrowUp':
        return move(0, -step)
      case 'ArrowDown':
        return move(0, step)
      case 'Delete':
      case 'Backspace':
        event.preventDefault()
        onChange(removeLayer(layout, layer.id))
        return onCommit?.()
      default:
        return
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  const renderLayerContent = (layer: PlacementLayer, size: { width: number; height: number }) => {
    if (layer.kind === 'logo' || layer.kind === 'image') {
      // Logo and image layers differ only in where the pixels come from — the
      // same split the compositor makes.
      const source =
        layer.kind === 'logo'
          ? logo
          : layer.imageUrl
            ? ({ kind: 'url', value: layer.imageUrl } as const)
            : null
      if (!source) return null

      if (source.kind === 'svg') {
        return (
          <div
            className="size-full [&>svg]:size-full"
            // Same sanitiser the rest of the app uses before injecting brand SVG.
            dangerouslySetInnerHTML={{ __html: sanitizeSvgMarkup(source.value) }}
          />
        )
      }
      const key = aspectKey(layer)
      return (
        <img
          src={source.value}
          alt=""
          draggable={false}
          onLoad={(e) => {
            const el = e.currentTarget
            if (el.naturalWidth > 0 && el.naturalHeight > 0) {
              rememberAspect(key, el.naturalWidth / el.naturalHeight)
            }
          }}
          className="size-full object-contain"
        />
      )
    }

    const metric = textMetrics[layer.id]
    const scale = metric && metric.width > 0 ? size.width / metric.width : 0
    // The span is laid out as a line box, but the layer's box is the ink inside
    // it. Sliding the span by the ink's own offset is what lands the letters on
    // the layer's box rather than near it — and it is the same offset the
    // server's crop takes out before scaling.
    const draw = metric
      ? {
          scale,
          left: -metric.left * scale,
          top: -metric.top * scale,
        }
      : null
    if (draw && scale > 0) lastDrawRef.current[layer.id] = draw
    const placement = draw ?? lastDrawRef.current[layer.id]
    const editing = editingId === layer.id

    // Typography identical either way — the wording must not shift or resize
    // at the moment it is opened for typing, or the placement being judged is
    // not the placement that prints.
    const type = {
      fontFamily: FONT_STACKS[layer.fontStyle ?? 'sans'],
      fontSize: MEASURE_FONT_PX,
      fontWeight: layer.fontWeight ?? 'normal',
      color: layer.color ?? DEFAULT_TEXT_COLOR,
      lineHeight: LINE_HEIGHT,
      transformOrigin: 'top left',
    } as const

    if (editing) {
      // Falls back to where it was last drawn, so emptying the wording leaves a
      // caret you can still see — see `lastDrawRef`.
      const edit = scale > 0 ? draw : (lastDrawRef.current[layer.id] ?? null)
      return (
        <span
          ref={editRef}
          role="textbox"
          aria-label="Edit the wording"
          aria-multiline="true"
          contentEditable
          // The node has no React children on purpose — see the caret effect.
          suppressContentEditableWarning
          spellCheck={false}
          style={{ ...type, transform: inkTransform(edit) }}
          onPointerDown={(e) => e.stopPropagation()}
          onInput={(e) => onEditInput(layer, e.currentTarget)}
          onBlur={endEdit}
          onKeyDown={(e) => {
            // The caret's keys are the caret's — nothing here reaches the
            // layer's own nudge and delete handling.
            e.stopPropagation()
            if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
              e.preventDefault()
              endEdit()
            }
          }}
          onBeforeInput={(e) => {
            // Cap the length the way the panel's field does. Only a plain
            // insertion at a collapsed caret is blocked: typing over a
            // selection replaces rather than grows, so it stays allowed.
            const inputType = (e.nativeEvent as InputEvent).inputType ?? ''
            if (inputType && !inputType.startsWith('insert')) return
            if (window.getSelection()?.isCollapsed === false) return
            if (e.currentTarget.innerText.length >= MAX_TEXT_LENGTH) {
              e.preventDefault()
            }
          }}
          onPaste={(e) => {
            // Paste the words, never the markup: a paste from a web page
            // carries its own fonts and colours, and this wording's own are
            // the design. `insertText` keeps the browser's undo stack, which
            // rebuilding the node by hand would throw away.
            e.preventDefault()
            const room = MAX_TEXT_LENGTH - e.currentTarget.innerText.length
            const text = e.clipboardData.getData('text/plain').slice(0, room)
            if (text) document.execCommand('insertText', false, text)
          }}
          className="absolute left-0 top-0 cursor-text select-text whitespace-pre text-center outline-none"
        />
      )
    }

    return (
      <span
        style={{
          ...type,
          transform: inkTransform(placement),
          // Hidden until measured, so it never flashes at 100px.
          visibility: scale ? 'visible' : 'hidden',
        }}
        className="absolute left-0 top-0 whitespace-pre text-center"
      >
        {layer.text}
      </span>
    )
  }

  return (
    <div
      className={cn(
        fit === 'square' ? 'space-y-2' : 'flex h-full min-h-0 flex-col gap-2',
        className,
      )}
    >
      <div
        ref={frameRef}
        className={cn(
          'relative w-full overflow-hidden rounded-brand border border-border/40 bg-muted/20 select-none',
          // In fill mode the frame grows to take the column rather than asking
          // for `height: 100%` — a percentage height resolves against the
          // parent's *specified* height, which is `auto` whenever the page is
          // scrolling rather than locked to the viewport, and collapses to 0.
          fit === 'square' ? 'aspect-square' : 'min-h-0 flex-1',
        )}
        style={{ touchAction: 'none' }}
        onPointerDown={beginPan}
        onPointerMove={onFramePointerMove}
        onPointerUp={endPan}
        onPointerLeave={endPan}
        onWheel={onWheel}
      >
        {baseImage && (
          <img
            ref={imageRef}
            src={baseImage}
            alt=""
            onLoad={measureBox}
            draggable={false}
            style={
              zoom === 1 && pan.x === 0 && pan.y === 0
                ? undefined
                : { transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }
            }
            className={cn(
              'pointer-events-none absolute inset-0 size-full object-contain transition-opacity',
              busy && 'opacity-40',
            )}
          />
        )}

        {box &&
          !busy &&
          layout.layers.map((layer) => {
            const size = layerSize(layer, box)
            const isSelected = layer.id === selectedId
            const isEditing = layer.id === editingId
            return (
              <div
                key={layer.id}
                role="button"
                // Out of the tab order while its own editable holds the focus,
                // so Tab leaves the wording rather than landing on its frame.
                tabIndex={disabled || isEditing ? -1 : 0}
                aria-label={layerLabel(layer)}
                onPointerDown={(e) => {
                  // Already typing: this press is placing the caret. Swallow it
                  // so the frame does not read it as a click on empty canvas
                  // and deselect on release, but let it through to the node.
                  if (isEditing) return e.stopPropagation()
                  beginDrag(e, layer, 'move')
                }}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={(e) => onLayerKeyDown(e, layer)}
                onFocus={() => setSelectedId(layer.id)}
                className={cn(
                  'absolute',
                  isEditing
                    ? 'cursor-text'
                    : disabled || layer.locked
                      ? 'cursor-default'
                      : 'cursor-move',
                  // A dashed border while typing, so the state is legible: this
                  // wording is open, and the next keystroke goes into it. An
                  // outline rather than a ring — a ring is a box-shadow, and a
                  // box-shadow cannot be dashed.
                  isEditing
                    ? 'outline-2 outline-dashed outline-primary outline-offset-2'
                    : cn(
                        'outline-none',
                        isSelected
                          ? layer.locked
                            ? 'ring-2 ring-muted-foreground/60 ring-offset-1 ring-offset-background'
                            : 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                          : 'ring-1 ring-transparent hover:ring-primary/40',
                      ),
                )}
                style={{
                  left: box.left + layer.x * box.width,
                  top: box.top + layer.y * box.height,
                  width: size.width,
                  height: size.height,
                  transform: `translate(-50%, -50%) rotate(${layer.rotation ?? 0}deg)`,
                }}
              >
                {/* Opacity belongs to the artwork, not to the controls.
                    Setting it on the wrapper faded the selection ring and every
                    handle along with the layer, so a layer at 10% was almost
                    impossible to grab back. */}
                <span
                  className="absolute inset-0"
                  style={{ opacity: layer.opacity ?? 1 }}
                >
                  {renderLayerContent(layer, size)}
                </span>

                {isSelected && !disabled && layer.locked && (
                  <span
                    aria-hidden
                    className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full border border-background bg-muted-foreground text-background"
                  >
                    <Lock className="size-2.5" />
                  </span>
                )}

                {isSelected && !disabled && !layer.locked && !isEditing && (
                  <>
                    {/* Scale — bottom-right, the corner everyone reaches for. */}
                    <span
                      role="slider"
                      aria-label="Resize"
                      aria-valuenow={Math.round(layer.width * 100)}
                      aria-valuemin={Math.round(MIN_LAYER_WIDTH * 100)}
                      aria-valuemax={Math.round(MAX_LAYER_WIDTH * 100)}
                      tabIndex={-1}
                      onPointerDown={(e) => beginDrag(e, layer, 'scale')}
                      onPointerMove={onPointerMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      className="absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize rounded-full border-2 border-background bg-primary"
                    />
                    {/* Remove — top-right, opposite the resize corner.
                        Deleting was reachable only from the rail's Remove
                        button or the Delete key, neither of which is where the
                        eye is while you are dragging something around. The
                        pointer handler stops here rather than starting a move
                        drag on the layer underneath. */}
                    <button
                      type="button"
                      aria-label={`Remove ${layerLabel(layer)}`}
                      title="Remove"
                      tabIndex={-1}
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        onChange(removeLayer(layout, layer.id))
                        onCommit?.()
                      }}
                      className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full border-2 border-background bg-destructive text-destructive-foreground transition-transform hover:scale-110"
                    >
                      <X className="size-2.5" strokeWidth={3} />
                    </button>
                    {/* Rotate — above the layer, on a stalk. */}
                    <span
                      role="slider"
                      aria-label="Rotate"
                      aria-valuenow={Math.round(layer.rotation ?? 0)}
                      aria-valuemin={-180}
                      aria-valuemax={180}
                      tabIndex={-1}
                      onPointerDown={(e) => beginDrag(e, layer, 'rotate')}
                      onPointerMove={onPointerMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      className="absolute -top-5 left-1/2 size-3 -translate-x-1/2 cursor-grab rounded-full border-2 border-background bg-primary"
                    />
                  </>
                )}
              </div>
            )
          })}

        {/* What the gesture is doing, in numbers, while it is doing it.
            Placement was otherwise pure feel — there was no way to tell 49%
            from 50%, or to repeat a size on a second design. Pinned to the top
            of the frame rather than following the layer, so it never sits under
            the cursor or falls off an edge. */}
        {box && dragging && dragReadout && (
          <span className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-brand border border-border/40 bg-background/90 px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground shadow-sm backdrop-blur">
            {dragReadout}
          </span>
        )}

        {/* Guides, only while a drag is actually sitting on one. */}
        {box && guides.x !== null && (
          <span
            className="pointer-events-none absolute w-px bg-primary/60"
            style={{
              left: box.left + guides.x * box.width,
              top: box.top,
              height: box.height,
            }}
          />
        )}
        {box && guides.y !== null && (
          <span
            className="pointer-events-none absolute h-px bg-primary/60"
            style={{
              top: box.top + guides.y * box.height,
              left: box.left,
              width: box.width,
            }}
          />
        )}

        {zoomable && !busy && (
          <div className="absolute bottom-2 right-2 flex items-center gap-0.5 rounded-brand border border-border/40 bg-background/90 px-1 py-0.5 shadow-sm backdrop-blur">
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => applyZoom(zoom / 1.25)}
              disabled={zoom <= 1}
              className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="min-w-10 text-center text-[11px] tabular-nums text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => applyZoom(zoom * 1.25)}
              disabled={zoom >= 4}
              className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
            >
              <Plus className="size-3.5" />
            </button>
            {zoom !== 1 && (
              <button
                type="button"
                aria-label="Fit"
                onClick={resetView}
                className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
              >
                <Maximize className="size-3.5" />
              </button>
            )}
          </div>
        )}

        {busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 px-6 text-center">
            {busy}
          </div>
        )}
      </div>

      {/* Off-screen text measurement at a known font size. */}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute -left-[9999px] -top-[9999px]"
      >
        {logo?.kind === 'svg' && (
          <div
            style={{ width: 200 }}
            className="[&>svg]:h-auto [&>svg]:w-full"
            ref={(node) => {
              if (!node) return
              const h = node.getBoundingClientRect().height
              if (h > 0) rememberAspect(LOGO_ASPECT_KEY, 200 / h)
            }}
            dangerouslySetInnerHTML={{ __html: sanitizeSvgMarkup(logo.value) }}
          />
        )}
        {layout.layers
          .filter((l) => l.kind === 'text')
          .map((l) => (
            <div
              key={l.id}
              data-layer-id={l.id}
              className="inline-block whitespace-pre text-center"
              style={{
                fontFamily: FONT_STACKS[l.fontStyle ?? 'sans'],
                fontSize: MEASURE_FONT_PX,
                // Bold sets wider than normal — measuring at the wrong weight
                // would scale the text to the wrong size and leave the browser
                // disagreeing with the server about how much room it takes.
                fontWeight: l.fontWeight ?? 'normal',
                lineHeight: LINE_HEIGHT,
              }}
            >
              {/* An empty inline-block aligned to the baseline: its box sits
                  exactly on the first line's baseline, which is where the DOM
                  will otherwise not say it put anything. Zero-sized, so it
                  changes neither the measured width nor the centring. */}
              <span
                data-baseline
                style={{
                  display: 'inline-block',
                  width: 0,
                  height: 0,
                  verticalAlign: 'baseline',
                }}
              />
              {l.text}
            </div>
          ))}
      </div>

      {showControls && selected && !disabled && (
        <SelectedLayerControls
          layer={selected}
          layout={layout}
          onChange={onChange}
        />
      )}
    </div>
  )
}

/** The properties strip for whichever layer is selected. */
export function SelectedLayerControls({
  layer,
  layout,
  onChange,
  onCommit,
  brandColors = [],
}: {
  layer: PlacementLayer
  layout: PlacementLayout
  onChange: (layout: PlacementLayout) => void
  /** Called when a value settles, so the host can take one undo snapshot. */
  onCommit?: () => void
  /** Swatches offered before the colour picker — the company's own palette. */
  brandColors?: string[]
}) {
  const patch = (values: Partial<PlacementLayer>) =>
    onChange(updateLayer(layout, layer.id, values))
  const patchAndCommit = (values: Partial<PlacementLayer>) => {
    patch(values)
    onCommit?.()
  }

  const rotation = Math.round(layer.rotation ?? 0)
  const opacity = Math.round((layer.opacity ?? 1) * 100)

  const atLayerLimit = layout.layers.length >= MAX_LAYERS
  const canDuplicate = layer.kind !== 'logo' && !atLayerLimit

  /**
   * The size track stops at 200% for comfort — that is where hand-placed work
   * lives, and a track running to 400% puts every useful value in its first
   * eighth. It stretches only for a layer that is already bigger, which happens
   * when a layout arrives from the model or from a restored version. Without
   * that, such a layer sat above the track's ceiling and could not be brought
   * back down.
   */
  const sizePercent = Math.round(layer.width * 100)
  const sizeMax = Math.max(200, Math.min(sizePercent, MAX_LAYER_WIDTH * 100))

  return (
    <div className="space-y-3 rounded-brand border border-border/40 bg-card/40 p-2.5">
      {layer.kind === 'text' && (
        <>
          {/* A textarea, not an input: wording can be more than one line, and
              both renderers already lay out on \n. */}
          <Textarea
            value={layer.text ?? ''}
            rows={2}
            maxLength={MAX_TEXT_LENGTH}
            aria-label="Text"
            onChange={(e) => patch({ text: e.target.value })}
            onBlur={() => onCommit?.()}
            className="min-h-0 py-1.5 text-sm"
          />
          {/* The canvas is the better place to do this and nothing on screen
              said so — a field here is not where you look to discover that the
              wording on the photograph can be typed into directly. */}
          <p className="text-[11px] text-muted-foreground">
            Or double-click the wording on the product to type on it directly.
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {FONT_STYLES.map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => patchAndCommit({ fontStyle: style })}
                className={cn(
                  'rounded-brand border px-2 py-0.5 text-xs transition-colors',
                  (layer.fontStyle ?? 'sans') === style
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border/40 text-muted-foreground hover:border-border',
                )}
                style={{ fontFamily: FONT_STACKS[style] }}
              >
                {FONT_LABELS[style]}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={layer.fontWeight === 'bold'}
              title="Bold"
              onClick={() =>
                patchAndCommit({
                  fontWeight: layer.fontWeight === 'bold' ? 'normal' : 'bold',
                })
              }
              className={cn(
                'rounded-brand border px-2 py-0.5 text-xs font-bold transition-colors',
                layer.fontWeight === 'bold'
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border/40 text-muted-foreground hover:border-border',
              )}
            >
              B
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {brandColors.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={`Use ${swatch}`}
                onClick={() => patchAndCommit({ color: swatch })}
                style={{ backgroundColor: swatch }}
                className={cn(
                  'size-5 rounded-full border transition-transform hover:scale-110',
                  (layer.color ?? '').toLowerCase() === swatch.toLowerCase()
                    ? 'border-primary ring-2 ring-primary/40'
                    : 'border-border/60',
                )}
              />
            ))}
            <input
              type="color"
              aria-label="Custom text colour"
              value={layer.color ?? DEFAULT_TEXT_COLOR}
              onChange={(e) => patch({ color: e.target.value })}
              onBlur={() => onCommit?.()}
              className="size-5 cursor-pointer rounded border border-border/40 bg-transparent p-0"
            />
          </div>
        </>
      )}

      {/* Numbers, for when dragging cannot say what you mean. Live updates on
          change, one undo step on release. */}
      <div className="space-y-2">
        <LayerSlider
          label="Size"
          value={sizePercent}
          suffix="%"
          min={Math.round(MIN_LAYER_WIDTH * 100)}
          max={sizeMax}
          disabled={layer.locked}
          onChange={(v) => patch({ width: v / 100 })}
          onCommit={() => onCommit?.()}
        />
        <LayerSlider
          label="Rotation"
          value={rotation}
          suffix="°"
          min={-180}
          max={180}
          disabled={layer.locked}
          onChange={(v) => patch({ rotation: v })}
          onCommit={() => onCommit?.()}
        />
        <LayerSlider
          label="Opacity"
          value={opacity}
          suffix="%"
          min={0}
          max={100}
          disabled={layer.locked}
          onChange={(v) => patch({ opacity: v / 100 })}
          onCommit={() => onCommit?.()}
        />
      </div>

      {/* Centring by hand means dragging until the guide catches, which is the
          first thing anyone tries and the fiddliest. Two buttons do it exactly. */}
      {!layer.locked && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-muted-foreground">Centre</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            title="Centre left to right"
            onClick={() => patchAndCommit({ x: 0.5 })}
            disabled={layer.x === 0.5}
          >
            <AlignHorizontalJustifyCenter className="size-3" />
            Across
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            title="Centre top to bottom"
            onClick={() => patchAndCommit({ y: 0.5 })}
            disabled={layer.y === 0.5}
          >
            <AlignVerticalJustifyCenter className="size-3" />
            Down
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-1">
        {rotation !== 0 && !layer.locked && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => patchAndCommit({ rotation: 0 })}
          >
            <RotateCcw className="size-3" />
            Straighten
          </Button>
        )}
        {/* Say why it is off rather than doing nothing when pressed — both
            refusals used to be silent no-ops inside `duplicateLayer`. */}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-muted-foreground"
          disabled={!canDuplicate}
          title={
            layer.kind === 'logo'
              ? 'A design carries one logo'
              : atLayerLimit
                ? `You can place up to ${MAX_LAYERS} things`
                : undefined
          }
          onClick={() => {
            onChange(duplicateLayer(layout, layer.id))
            onCommit?.()
          }}
        >
          <Copy className="size-3" />
          Duplicate
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={() => patchAndCommit({ locked: !layer.locked })}
        >
          {layer.locked ? <LockOpen className="size-3" /> : <Lock className="size-3" />}
          {layer.locked ? 'Unlock' : 'Lock'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={() => {
            onChange(removeLayer(layout, layer.id))
            onCommit?.()
          }}
        >
          <Trash2 className="size-3" />
          Remove
        </Button>
      </div>
    </div>
  )
}

/** One labelled slider with its current value read out beside it. */
function LayerSlider({
  label,
  value,
  suffix,
  min,
  max,
  disabled,
  onChange,
  onCommit,
}: {
  label: string
  value: number
  suffix: string
  min: number
  max: number
  disabled?: boolean
  onChange: (value: number) => void
  onCommit: () => void
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">
          {value}
          {suffix}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={1}
        disabled={disabled}
        aria-label={label}
        // Live while dragging; the snapshot waits for release, so scrubbing a
        // slider is one undo step rather than a hundred.
        onValueChange={([v]) => onChange(v)}
        onValueCommit={onCommit}
      />
    </div>
  )
}
