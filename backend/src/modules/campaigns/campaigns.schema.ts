import { z } from 'zod'

/** Brand signals the client sends (it holds these in BrandContext + session). */
export const campaignBrandSchema = z.object({
  companyName: z.string().trim().min(1, 'companyName is required'),
  description: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
  keywords: z.array(z.string()).optional(),
  tagline: z.string().optional().nullable(),
  primaryColor: z.string().optional().nullable(),
  secondaryColor: z.string().optional().nullable(),
  domain: z.string().optional().nullable(),
  // Logo branded onto every product in the composite kit image. One of
  // url / data-uri / inline svg. Falls back to the company's stored extraction.
  logo: z.string().optional().nullable(),
  logoType: z.string().optional().nullable(),
})

export const generateCampaignSchema = z.object({
  brand: campaignBrandSchema,
  bundleSize: z.coerce.number().int().min(1).max(12).optional(),
  /** Optional natural-language brief steering products, copy, and imagery. */
  brief: z.string().trim().max(1000).optional(),
})

export const createCampaignSchema = z.object({
  domain: z.string().optional().nullable(),
  title: z.string().trim().min(1, 'title is required'),
  description: z.string().optional(),
  productIds: z.array(z.string().uuid()).optional(),
})

export const updateCampaignSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().optional(),
    productIds: z.array(z.string().uuid()).optional(),
    status: z.enum(['draft', 'approved', 'dismissed']).optional(),
    /**
     * Render-time only, never persisted: the caller's live brand, so a bundle
     * change re-renders WITH the logo even when the campaign has no domain to
     * look a company up by.
     */
    brand: campaignBrandSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  })

/**
 * Manual re-render. Body is optional; `brand` supplies the logo when given.
 * The supplies are render-time only, never persisted: the box builder sends
 * whatever the shopper has selected right now so the bundle photo shows the
 * box they actually chose rather than a generic kraft one.
 */
export const regenerateHeroImageSchema = z.object({
  brand: campaignBrandSchema.optional(),
  packagingId: z.string().uuid().optional(),
  fillingId: z.string().uuid().optional(),
  /** The shopper's printed-box design, used in place of the catalog photo. */
  packagingImageUrl: z.string().trim().min(1).optional(),
})

export type RegenerateHeroImageBody = z.infer<typeof regenerateHeroImageSchema>

export const listCampaignsQuerySchema = z.object({
  domain: z.string().optional(),
})

/** Storefront query: active videos for a domain, optionally ranked by browse context. */
export const listActiveVideosQuerySchema = z.object({
  domain: z.string().optional(),
  category: z.string().optional(),
  q: z.string().optional(),
})

/** Add a video to a campaign (metadata + already-uploaded video URL). */
export const createCampaignVideoSchema = z.object({
  url: z.string().trim().min(1, 'url is required'),
  description: z.string().trim().max(1000).optional().nullable(),
  orientation: z.enum(['portrait', 'landscape']).optional().nullable(),
  startsAt: z.coerce.date().optional().nullable(),
  endsAt: z.coerce.date().optional().nullable(),
  priority: z.coerce.number().int().min(0).max(100).optional(),
})

export const updateCampaignVideoSchema = z
  .object({
    description: z.string().trim().max(1000).optional().nullable(),
    orientation: z.enum(['portrait', 'landscape']).optional().nullable(),
    startsAt: z.coerce.date().optional().nullable(),
    endsAt: z.coerce.date().optional().nullable(),
    priority: z.coerce.number().int().min(0).max(100).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  })

export type CreateCampaignVideoBody = z.infer<typeof createCampaignVideoSchema>
export type UpdateCampaignVideoBody = z.infer<typeof updateCampaignVideoSchema>

export type CampaignBrandInput = z.infer<typeof campaignBrandSchema>
export type GenerateCampaignBody = z.infer<typeof generateCampaignSchema>
export type CreateCampaignBody = z.infer<typeof createCampaignSchema>
export type UpdateCampaignBody = z.infer<typeof updateCampaignSchema>
