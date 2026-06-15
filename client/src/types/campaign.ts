import type { Product } from './product'

export type CampaignStatus = 'draft' | 'approved' | 'dismissed'

export interface Campaign {
  id: string
  domain: string | null
  title: string
  description: string
  status: CampaignStatus
  productIds: string[]
  heroImageUrl: string | null
  products: Product[]
  createdAt: string
  updatedAt: string
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
