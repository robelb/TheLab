import { z } from 'zod'

/** Copy the marketing side writes, in both languages a campaign can run in. */
const localizedText = z.object({
  de: z.string().trim().min(1).max(200),
  en: z.string().trim().min(1).max(200),
})

const localizedTextOptional = z.object({
  de: z.string().trim().max(400),
  en: z.string().trim().max(400),
})

const slug = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9-]+$/, 'may only contain lowercase letters, digits and hyphens — for example weihnachten-2026')

export const createCollectionSchema = z.object({
  slug,
  title: localizedText,
  subtitle: localizedTextOptional.nullish(),
  tag: z.string().trim().min(1).max(64).toLowerCase(),
  featuredBundleIds: z.array(z.string().uuid()).max(12).default([]),
  defaultLocale: z.enum(['de', 'en']).default('de'),
  active: z.boolean().default(true),
  /** False for a page that only sells ready-made boxes. */
  allowCustomization: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(500).default(0),
})

export type CreateCollectionBody = z.infer<typeof createCollectionSchema>

export const updateCollectionSchema = createCollectionSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })

export type UpdateCollectionBody = z.infer<typeof updateCollectionSchema>

/** Which products belong to a collection. Both lists optional, both bounded. */
export const collectionMembershipSchema = z
  .object({
    add: z.array(z.string().uuid()).max(200).optional(),
    remove: z.array(z.string().uuid()).max(200).optional(),
  })
  .refine((v) => (v.add?.length ?? 0) + (v.remove?.length ?? 0) > 0, {
    message: 'Nothing to add or remove',
  })

/** One page of what is in a collection, as the editor's table asks for it. */
export const collectionMembersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).optional(),
  kind: z.enum(['single', 'bundle']).optional(),
})

export type CollectionMembersQuery = z.infer<typeof collectionMembersQuerySchema>

export type CollectionMembershipBody = z.infer<typeof collectionMembershipSchema>
