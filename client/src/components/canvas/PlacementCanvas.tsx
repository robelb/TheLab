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

/** Text is measured once at this size, then scaled — see `textMetrics`. */
const MEASURE_FONT_PX = 100

/** Line spacing for multi-line wording. Mirrors `LINE_HEIGHT_EM` on the server. */
const LINE_HEIGHT = 1.2

/** How close to a guide a drag has to come, in pixels, before it snaps. */
const SNAP_PX = 6

/** Every logo layer draws the same supplied mark, so they share one measurement. */
const LOGO_ASPECT_KEY = '__logo__'

/** A run of arrow-key nudges settles into one undo step after this long. */
const NUDGE_COMMIT_MS = 400

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
  return layer.locked
    ? `${what} — locked`
    : `${what} — drag to move, arrow keys to nudge`
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
  const panRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null)
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
  // Natural size of each text layer at MEASURE_FONT_PX, keyed by layer id.
  const [textMetrics, setTextMetrics] = useState<
    Record<string, { width: number; height: number }>
  >({})
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
    const next: Record<string, { width: number; height: number }> = {}
    for (const child of Array.from(node.children)) {
      const id = (child as HTMLElement).dataset.layerId
      if (!id) continue
      const rect = (child as HTMLElement).getBoundingClientRect()
      if (rect.width > 0) next[id] = { width: rect.width, height: rect.height }
    }
    setTextMetrics((prev) => {
      const ids = Object.keys(next)
      const same =
        ids.length === Object.keys(prev).length &&
        ids.every(
          (id) =>
            prev[id] &&
            Math.abs(prev[id].width - next[id].width) < 0.5 &&
            Math.abs(prev[id].height - next[id].height) < 0.5,
        )
      return same ? prev : next
    })
  }, [layout.layers])

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

  /** On-screen size of a layer, in frame pixels. */
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
    const frame = frameRef.current?.getBoundingClientRect()
    if (!frame) return

    event.preventDefault()
    event.stopPropagation()
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    setSelectedId(layer.id)

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
      const width = clamp((layer.width * distance) / drag.startDistance, 0.02, 2)
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
    if (!dragRef.current) return
    const target = event.currentTarget as HTMLElement
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
    setGuides({ x: null, y: null })
    // One gesture, one undo step.
    onCommit?.()
  }

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
    // Only when zoomed in, and only from empty canvas — a press on a layer is
    // a drag, and a press that never moves is still a deselect.
    if (!zoomable || disabled || zoom === 1) return
    panRef.current = { x: pan.x, y: pan.y, startX: event.clientX, startY: event.clientY }
  }

  const onFramePointerMove = (event: React.PointerEvent) => {
    const p = panRef.current
    if (!p) return
    setPan({ x: p.x + (event.clientX - p.startX), y: p.y + (event.clientY - p.startY) })
  }

  const endPan = () => {
    panRef.current = null
  }

  const onLayerKeyDown = (event: React.KeyboardEvent, layer: PlacementLayer) => {
    if (disabled || layer.locked) return
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
    return (
      <span
        style={{
          fontFamily: FONT_STACKS[layer.fontStyle ?? 'sans'],
          fontSize: MEASURE_FONT_PX,
          fontWeight: layer.fontWeight ?? 'normal',
          color: layer.color ?? '#1f2933',
          lineHeight: LINE_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          // Hidden until measured, so it never flashes at 100px.
          visibility: scale ? 'visible' : 'hidden',
        }}
        className="absolute left-0 top-0 whitespace-pre"
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
        onPointerDown={(e) => {
          setSelectedId(null)
          beginPan(e)
        }}
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
            return (
              <div
                key={layer.id}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-label={layerLabel(layer)}
                onPointerDown={(e) => beginDrag(e, layer, 'move')}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={(e) => onLayerKeyDown(e, layer)}
                onFocus={() => setSelectedId(layer.id)}
                className={cn(
                  'absolute outline-none',
                  disabled || layer.locked ? 'cursor-default' : 'cursor-move',
                  isSelected
                    ? layer.locked
                      ? 'ring-2 ring-muted-foreground/60 ring-offset-1 ring-offset-background'
                      : 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                    : 'ring-1 ring-transparent hover:ring-primary/40',
                )}
                style={{
                  left: box.left + layer.x * box.width,
                  top: box.top + layer.y * box.height,
                  width: size.width,
                  height: size.height,
                  opacity: layer.opacity ?? 1,
                  transform: `translate(-50%, -50%) rotate(${layer.rotation ?? 0}deg)`,
                }}
              >
                {renderLayerContent(layer, size)}

                {isSelected && !disabled && layer.locked && (
                  <span
                    aria-hidden
                    className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full border border-background bg-muted-foreground text-background"
                  >
                    <Lock className="size-2.5" />
                  </span>
                )}

                {isSelected && !disabled && !layer.locked && (
                  <>
                    {/* Scale — bottom-right, the corner everyone reaches for. */}
                    <span
                      role="slider"
                      aria-label="Resize"
                      aria-valuenow={Math.round(layer.width * 100)}
                      aria-valuemin={2}
                      aria-valuemax={200}
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
              className="inline-block whitespace-pre"
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
              value={layer.color ?? '#1f2933'}
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
          value={Math.round(layer.width * 100)}
          suffix="%"
          min={2}
          max={200}
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
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-muted-foreground"
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
