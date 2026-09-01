/**
 * Where the user dragged the logo and any wording onto a product photo.
 *
 * Mirrors `backend/src/customizer/placementLayout.ts` — the same deliberate
 * duplication as `lib/box.ts`, and it carries the same obligation: change one
 * and change the other. The server validates this shape with zod on the way in,
 * so a drift shows up as a 400 rather than a silently dropped layer.
 *
 * Every coordinate is normalised `0..1` against the BASE IMAGE'S OWN PIXEL BOX,
 * never the element it is rendered into. The preview letterboxes the photo with
 * `object-contain`, so anything measured against the container drifts the
 * moment the dialog resizes — and drifts differently from the server, which has
 * only the image.
 *
 * Layers are centre-anchored because rotation and scaling both pivot on the
 * centre; anchored at a corner, every resize handle would also translate.
 */

export const FONT_STYLES = ['sans', 'serif', 'script', 'mono'] as const
export type FontStyle = (typeof FONT_STYLES)[number]

export const FONT_WEIGHTS = ['normal', 'bold'] as const
export type FontWeight = (typeof FONT_WEIGHTS)[number]

export interface PlacementLayer {
  id: string
  /**
   * `logo` draws the one brand mark supplied alongside the layout; `image`
   * draws its own artwork from `imageUrl`. They render identically — the split
   * exists because the logo gets a dedicated full-quality attachment in the
   * generation prompts and arbitrary artwork does not.
   */
  kind: 'logo' | 'text' | 'image'
  /** Centre of the layer, as a fraction of the base image's width. */
  x: number
  /** Centre of the layer, as a fraction of the base image's height. */
  y: number
  /** How much of the base image's width the layer spans. */
  width: number
  /** Clockwise, in degrees. */
  rotation?: number
  opacity?: number
  /** Pinned in the editor: no dragging, no nudging. Ignored when compositing. */
  locked?: boolean
  // ── image layers only
  /** Where the artwork lives. A served URL, uploaded when the file was picked. */
  imageUrl?: string
  // ── text layers only
  text?: string
  fontStyle?: FontStyle
  fontWeight?: FontWeight
  /** `#rrggbb`. */
  color?: string
}

export interface PlacementLayout {
  layers: PlacementLayer[]
}
