import type { Product } from './product'

export type CampaignStatus = 'draft' | 'approved' | 'dismissed'

export type VideoOrientation = 'portrait' | 'landscape'

/** A marketing video attached to a campaign (embedding omitted server-side). */
export interface CampaignVideoItem {
  id: string
  campaignId: string
  url: string
  description: string | null
  orientation: VideoOrientation | null
  startsAt: string | null
  endsAt: string | null
  priority: number
  createdAt: string
}

export interface Campaign {
  id: string
  domain: string | null
  title: string
  description: string
  status: CampaignStatus
  productIds: string[]
  heroImageUrl: string | null
  products: Product[]
  videos: CampaignVideoItem[]
  createdAt: string
  updatedAt: string
}

/** Lightweight shape returned by the storefront `/campaigns/active` feed. */
export interface ActiveCampaignVideo {
  id: string
  campaignId: string
  title: string
  videoUrl: string
  videoOrientation: VideoOrientation | null
  videoDescription: string | null
}

/** Brand signals the client sends when generating a campaign. */
export interface CampaignBrandSignals {
  companyName: string
  description?: string | null
  industry?: string | null
  keywords?: string[]
  tagline?: string | null
  primaryColor?: string | null
  secondaryColor?: string | null
  domain?: string | null
  logo?: string | null
  logoType?: string | null
}
