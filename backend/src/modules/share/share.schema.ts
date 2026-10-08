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
  /** Owning company — scopes a saved design to that company's shop view. */
  companyId: z.string().uuid().optional(),
  domain: z.string().trim().max(255).optional(),
  title: z.string().trim().max(300).optional(),
  // Photoshoot briefs run 4–10k chars; keep headroom so sharing never 400s.
  prompt: z.string().trim().max(20_000).optional(),
  brand: brandSnapshotSchema,
})

export type CreateShareBody = z.infer<typeof createShareSchema>
