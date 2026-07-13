import { z } from 'zod'

export const brandSnapshotSchema = z
  .object({
    companyName: z.string().trim().max(200).nullish(),
    logo: z.string().trim().max(200_000).nullish(),
    logoType: z.string().trim().max(40).nullish(),
    primaryColor: z.string().trim().max(64).nullish(),
  })
  .optional()

/** Body for POST /api/share — mint a public link for any image. */
export const createShareSchema = z.object({
  imageUrl: z.string().trim().min(1, 'imageUrl is required'),
  productId: z.string().uuid().optional(),
  domain: z.string().trim().max(255).optional(),
  title: z.string().trim().max(300).optional(),
  prompt: z.string().trim().max(4000).optional(),
  brand: brandSnapshotSchema,
})

export type CreateShareBody = z.infer<typeof createShareSchema>
