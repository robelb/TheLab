/**
 * Helpers for the placement layout — defaults, clamping, snapping, and reading
 * one back out of untrusted storage.
 *
 * Kept out of `PlacementCanvas` so the drag surface is only about pointers, and
 * so `BuildBoxPage` can validate a layout from localStorage without mounting
 * the editor.
 */

import {
  FONT_STYLES,
  FONT_WEIGHTS,
  type FontStyle,
  type FontWeight,
  type PlacementLayer,
  type PlacementLayout,
} from '@/types/layout'

export const EMPTY_LAYOUT: PlacementLayout = { layers: [] }

/** Mirrors the server's zod bounds — see `backend/src/customizer/placementLayout.ts`. */
export const MIN_LAYER_WIDTH = 0.01
export const MAX_LAYER_WIDTH = 4
export const MAX_LAYERS = 12
export const MAX_TEXT_LENGTH = 120

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function hasPlacement(layout: PlacementLayout | null | undefined): boolean {
  return Boolean(layout && layout.layers.length > 0)
}

let counter = 0
function nextId(prefix: string): string {
  counter += 1
  return `${prefix}-${counter}`
}

/**
 * Where a logo starts before anyone drags it: centred on the upper half, at the
 * modest size the prompt system used to ask for in words. A default that lands
 * somewhere plausible means the checkbox alone still produces a sensible box.
 */
export function defaultLogoLayer(): PlacementLayer {
  return { id: nextId('logo'), kind: 'logo', x: 0.5, y: 0.42, width: 0.24 }
}

/** An uploaded piece of artwork, dropped in the middle at a modest size. */
export function defaultImageLayer(imageUrl: string): PlacementLayer {
  return { id: nextId('image'), kind: 'image', x: 0.5, y: 0.5, width: 0.28, imageUrl }
}

export function defaultTextLayer(text: string): PlacementLayer {
  return {
    id: nextId('text'),
    kind: 'text',
    x: 0.5,
    y: 0.62,
    width: 0.45,
    text: text.slice(0, MAX_TEXT_LENGTH),
    fontStyle: 'sans',
    color: '#1f2933',
  }
}

// ── layer edits ─────────────────────────────────────────────────────────────

export function updateLayer(
  layout: PlacementLayout,
  id: string,
  patch: Partial<PlacementLayer>,
): PlacementLayout {
  return {
    layers: layout.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
  }
}

export function removeLayer(layout: PlacementLayout, id: string): PlacementLayout {
  return { layers: layout.layers.filter((l) => l.id !== id) }
}

export function addLayer(layout: PlacementLayout, layer: PlacementLayer): PlacementLayout {
  if (layout.layers.length >= MAX_LAYERS) return layout
  return { layers: [...layout.layers, layer] }
}

/**
 * Move a layer one step through the stack.
 *
 * Array order IS z-order in both renderers — the DOM paints in map order and
 * `composeLayout` composites in iteration order — so reordering the array is
 * the whole feature, with no contract change behind it. 'up' means towards the
 * viewer, which is towards the END of the array.
 */
export function moveLayer(
  layout: PlacementLayout,
  id: string,
  direction: 'up' | 'down',
): PlacementLayout {
  const index = layout.layers.findIndex((l) => l.id === id)
  if (index === -1) return layout
  const target = direction === 'up' ? index + 1 : index - 1
  if (target < 0 || target >= layout.layers.length) return layout

  const layers = [...layout.layers]
  ;[layers[index], layers[target]] = [layers[target], layers[index]]
  return { layers }
}

/** Copy a layer, nudged clear of the original so it is visibly a second thing. */
export function duplicateLayer(
  layout: PlacementLayout,
  id: string,
): PlacementLayout {
  const source = layout.layers.find((l) => l.id === id)
  if (!source || layout.layers.length >= MAX_LAYERS) return layout
  return {
    layers: [
      ...layout.layers,
      {
        ...source,
        id: nextId(source.kind),
        x: clamp(source.x + 0.03, 0, 1),
        y: clamp(source.y + 0.03, 0, 1),
        // A copy you cannot immediately move would look like nothing happened.
        locked: false,
      },
    ],
  }
}

export function findLogoLayer(layout: PlacementLayout): PlacementLayer | undefined {
  return layout.layers.find((l) => l.kind === 'logo')
}

// ── snapping ────────────────────────────────────────────────────────────────

/** Fractions a dragged layer settles onto: the centre lines and the thirds. */
const SNAP_POINTS = [1 / 3, 0.5, 2 / 3]

export interface SnapResult {
  value: number
  /** The line that caught it, for drawing the guide. Null when nothing did. */
  guide: number | null
}

/**
 * Pull a coordinate onto a guide when it comes within `threshold` of one.
 * The threshold arrives in the same normalised units as the value, converted
 * from pixels by the caller — so the snap feels the same at any dialog size.
 */
export function snap(value: number, threshold: number): SnapResult {
  for (const point of SNAP_POINTS) {
    if (Math.abs(value - point) <= threshold) return { value: point, guide: point }
  }
  return { value, guide: null }
}

// ── reading a layout back from untrusted storage ────────────────────────────

function isFontStyle(value: unknown): value is FontStyle {
  return typeof value === 'string' && (FONT_STYLES as readonly string[]).includes(value)
}

function isFontWeight(value: unknown): value is FontWeight {
  return (
    typeof value === 'string' && (FONT_WEIGHTS as readonly string[]).includes(value)
  )
}

function parseLayer(raw: unknown): PlacementLayer | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.kind !== 'logo' && r.kind !== 'text' && r.kind !== 'image') return null

  const num = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null

  const x = num(r.x)
  const y = num(r.y)
  const width = num(r.width)
  if (x === null || y === null || width === null) return null

  const text = typeof r.text === 'string' ? r.text.trim().slice(0, MAX_TEXT_LENGTH) : undefined
  // A text layer with nothing to say renders as nothing — drop it rather than
  // letting the server reject the whole layout for one empty layer.
  if (r.kind === 'text' && !text) return null

  // Same for artwork whose URL did not survive: the layer cannot draw, and the
  // server would reject the whole layout over it.
  const imageUrl =
    typeof r.imageUrl === 'string' && r.imageUrl.trim()
      ? r.imageUrl.trim().slice(0, 2048)
      : undefined
  if (r.kind === 'image' && !imageUrl) return null

  const rotation = num(r.rotation)
  const opacity = num(r.opacity)

  return {
    id: typeof r.id === 'string' && r.id ? r.id.slice(0, 64) : nextId(r.kind),
    kind: r.kind,
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1),
    width: clamp(width, MIN_LAYER_WIDTH, MAX_LAYER_WIDTH),
    ...(rotation !== null ? { rotation: clamp(rotation, -180, 180) } : {}),
    ...(opacity !== null ? { opacity: clamp(opacity, 0, 1) } : {}),
    ...(r.locked === true ? { locked: true } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(text ? { text } : {}),
    ...(isFontStyle(r.fontStyle) ? { fontStyle: r.fontStyle } : {}),
    ...(isFontWeight(r.fontWeight) ? { fontWeight: r.fontWeight } : {}),
    ...(typeof r.color === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(r.color)
      ? { color: r.color }
      : {}),
  }
}

/**
 * Rebuild a layout from whatever localStorage handed back. A layout represents
 * real manual effort, so a single bad layer drops that layer rather than the
 * whole thing — but anything unrecognisable degrades to null, never a throw.
 */
export function parseLayout(raw: unknown): PlacementLayout | null {
  if (!raw || typeof raw !== 'object') return null
  const layers = (raw as { layers?: unknown }).layers
  if (!Array.isArray(layers)) return null

  const parsed = layers
    .map(parseLayer)
    .filter((l): l is PlacementLayer => l !== null)
    .slice(0, MAX_LAYERS)

  return parsed.length > 0 ? { layers: parsed } : null
}
