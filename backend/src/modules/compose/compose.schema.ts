import { z } from 'zod'
import { placementLayoutSchema } from '../../customizer/placementLayout.js'

/**
 * The flat-mockup request. Same inputs the generation endpoints take, minus
 * everything about the render — this path never touches an image model.
 */
export const composeSchema = z.object({
  /** The photo to paste onto: a product image or a box image. */
  baseImageUrl: z.string().trim().min(1, 'baseImageUrl is required'),
  layout: placementLayoutSchema,
  /** The logo, however the client has it (upload / remote URL / inline SVG). */
  brandingImage: z.string().min(1).optional(),
  brandingImageUrl: z.string().trim().min(1).optional(),
  brandingSvg: z.string().min(1).optional(),
})

export type ComposeBody = z.infer<typeof composeSchema>
