import { z } from 'zod'
import { placementLayoutSchema } from '../../customizer/placementLayout.js'

/** Long enough to be descriptive, short enough to read in a narrow rail. */
const label = z.string().trim().min(1, 'A version needs a name').max(80)

const imageUrl = z.string().trim().min(1)

/**
 * A version must arrive whole.
 *
 * `source` is required because a version that cannot be reopened onto the photo
 * it was built on is not a version. Of the two pictures at least one must be
 * present — a placed design has a flat composite, a design briefed in words has
 * only a render — and which one it is decides what gets restored.
 */
export const createDesignVersionSchema = z
  .object({
    label: label.optional(),
    source: imageUrl,
    flat: imageUrl.nullish(),
    photoreal: imageUrl.nullish(),
    prompt: z.string().trim().max(2000).nullish(),
    layout: placementLayoutSchema.nullish(),
    logoUrl: imageUrl.nullish(),
  })
  .refine((v) => Boolean(v.flat || v.photoreal), {
    message: 'A version needs either a mockup or a render',
    path: ['flat'],
  })

export const renameDesignVersionSchema = z.object({ label })

export type CreateDesignVersionBody = z.infer<typeof createDesignVersionSchema>
export type RenameDesignVersionBody = z.infer<typeof renameDesignVersionSchema>
