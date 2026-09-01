/**
 * The placement layout — where a shopper dragged the logo and any wording onto
 * a product photo.
 *
 * This is the contract between three renderers that must agree pixel for pixel:
 * the browser's drag-and-drop editor (`PlacementCanvas`), the server-side sharp
 * compositor (`composeLayout`), and the prose the image prompt reads
 * (`describePlacement`). They agree because every coordinate is normalised
 * `0..1` against the BASE IMAGE'S OWN PIXEL BOX — never a container, never the
 * rendered element. The browser letterboxes the photo with `object-contain`, so
 * anything measured against the container drifts as the dialog resizes.
 *
 * Layers are centre-anchored rather than top-left because both rotation and
 * scaling pivot on the centre. Anchored at a corner, every resize handle would
 * also translate the layer.
 */

import { z } from 'zod'

/** Typeface families a text layer may ask for. Fixed set — never user input. */
export const FONT_STYLES = ['sans', 'serif', 'script', 'mono'] as const
export type FontStyle = (typeof FONT_STYLES)[number]

/** Weight a text layer may ask for. Two, because a placement hint needs no more. */
export const FONT_WEIGHTS = ['normal', 'bold'] as const
export type FontWeight = (typeof FONT_WEIGHTS)[number]

export interface PlacementLayer {
  id: string
  /**
   * `logo` draws the one brand mark supplied alongside the layout; `image`
   * draws its own artwork, fetched from `imageUrl`. They render identically —
   * the split exists because the logo has a dedicated full-quality attachment
   * in the generation prompts and arbitrary artwork does not.
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
  /**
   * Pinned in the editor: no dragging, no nudging. Round-trips through the
   * draft so the state survives a reload, and is ignored everywhere else —
   * compositing a locked layer is no different from compositing any other.
   */
  locked?: boolean
  // ── image layers only
  /** Where the artwork lives. A served URL, uploaded when the file was picked. */
  imageUrl?: string
  // ── text layers only
  text?: string
  fontStyle?: FontStyle
  fontWeight?: FontWeight
  /** `#rgb` or `#rrggbb`. */
  color?: string
}

export interface PlacementLayout {
  layers: PlacementLayer[]
}

/** A layer smaller than this is invisible in the render — treat it as absent. */
export const MIN_LAYER_WIDTH = 0.01
export const MAX_LAYERS = 12
export const MAX_TEXT_LENGTH = 120
/** Distinct artwork URLs one layout may pull. Bounds the per-render fetch fan-out. */
export const MAX_LAYER_ASSETS = 6

const unit = z.number().min(0).max(1)

export const placementLayerSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    kind: z.enum(['logo', 'text', 'image']),
    x: unit,
    y: unit,
    // A layer may legitimately overflow the frame (artwork running off an
    // edge), so width is capped well above 1 rather than at it.
    width: z.number().min(MIN_LAYER_WIDTH).max(4),
    rotation: z.number().min(-180).max(180).optional(),
    opacity: z.number().min(0).max(1).optional(),
    locked: z.boolean().optional(),
    imageUrl: z.string().trim().min(1).max(2048).optional(),
    text: z.string().trim().max(MAX_TEXT_LENGTH).optional(),
    fontStyle: z.enum(FONT_STYLES).optional(),
    fontWeight: z.enum(FONT_WEIGHTS).optional(),
    color: z
      .string()
      .trim()
      .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
      .optional(),
  })
  .refine((l) => l.kind !== 'text' || Boolean(l.text), {
    message: 'A text layer needs text',
  })
  .refine((l) => l.kind !== 'image' || Boolean(l.imageUrl), {
    message: 'An image layer needs an image',
  })

export const placementLayoutSchema = z.object({
  layers: z.array(placementLayerSchema).max(MAX_LAYERS),
})

/** True when a layout would actually change the image. */
export function hasPlacement(
  layout: PlacementLayout | null | undefined,
): layout is PlacementLayout {
  return Boolean(layout && layout.layers.length > 0)
}
