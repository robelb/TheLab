import { apiClient } from '@/lib/api-client'
import type {
  ActiveCampaignVideo,
  Campaign,
  CampaignBrandSignals,
  CampaignStatus,
  CampaignVideoItem,
  VideoOrientation,
} from '@/types/campaign'

export async function fetchCampaigns(domain?: string): Promise<Campaign[]> {
  const params = domain ? { domain } : undefined
  const { data } = await apiClient.get<{ data: Campaign[] }>('/campaigns', {
    params,
  })
  return data.data
}

export async function fetchCampaign(id: string): Promise<Campaign> {
  const { data } = await apiClient.get<Campaign>(
    `/campaigns/${encodeURIComponent(id)}`,
  )
  return data
}

export interface CampaignCreate {
  title: string
  description?: string
  productIds?: string[]
  domain?: string | null
}

export async function createCampaign(input: CampaignCreate): Promise<Campaign> {
  const { data } = await apiClient.post<Campaign>('/campaigns', input)
  return data
}

export async function generateCampaign(
  brand: CampaignBrandSignals,
  bundleSize?: number,
  brief?: string,
): Promise<Campaign> {
  const { data } = await apiClient.post<Campaign>('/campaigns/generate', {
    brand,
    bundleSize,
    brief,
  })
  return data
}

export interface CampaignUpdate {
  title?: string
  description?: string
  productIds?: string[]
  status?: CampaignStatus
  /**
   * Not persisted — the brand to render the bundle image with when this save
   * triggers a regeneration. Without it the server can only look a logo up by
   * the campaign's domain, so a domainless campaign renders unbranded.
   */
  brand?: CampaignBrandSignals
}

export async function updateCampaign(
  id: string,
  input: CampaignUpdate,
): Promise<Campaign> {
  const { data } = await apiClient.patch<Campaign>(
    `/campaigns/${encodeURIComponent(id)}`,
    input,
  )
  return data
}

/**
 * Kick off a bundle-image regeneration. Resolves as soon as the job is queued
 * (campaign comes back with `heroImageStatus: 'pending'`); the caller polls the
 * campaign for the finished image.
 */
/**
 * The box and filling to photograph the bundle in. Render-time only — the
 * campaign never stores them, so a dashboard regeneration falls back to the
 * default kraft box.
 */
export interface HeroImageSupplies {
  packagingId?: string
  fillingId?: string
  /** The shopper's printed-box design, used instead of the catalog photo. */
  packagingImageUrl?: string
  /**
   * Designs made for the products inside, keyed by product id. Without these
   * the group shot would show plain catalogue items beside a box the shopper
   * just branded.
   */
  productImages?: Record<string, string>
}

export async function regenerateCampaignHeroImage(
  id: string,
  brand?: CampaignBrandSignals,
  supplies?: HeroImageSupplies,
): Promise<Campaign> {
  const { data } = await apiClient.post<Campaign>(
    `/campaigns/${encodeURIComponent(id)}/hero-image`,
    { ...(brand ? { brand } : {}), ...(supplies ?? {}) },
  )
  return data
}

export async function deleteCampaign(id: string): Promise<void> {
  await apiClient.delete(`/campaigns/${encodeURIComponent(id)}`)
}

export interface CampaignVideoInput {
  url: string
  description?: string | null
  orientation?: VideoOrientation | null
  startsAt?: string | null
  endsAt?: string | null
  priority?: number
}

export async function addCampaignVideo(
  campaignId: string,
  input: CampaignVideoInput,
): Promise<CampaignVideoItem> {
  const { data } = await apiClient.post<CampaignVideoItem>(
    `/campaigns/${encodeURIComponent(campaignId)}/videos`,
    input,
  )
  return data
}

export async function deleteCampaignVideo(
  campaignId: string,
  videoId: string,
): Promise<void> {
  await apiClient.delete(
    `/campaigns/${encodeURIComponent(campaignId)}/videos/${encodeURIComponent(videoId)}`,
  )
}

export interface ActiveVideoParams {
  domain?: string
  category?: string
  q?: string
}

/** Storefront feed: currently-active campaign video ads for a domain. */
export async function fetchActiveCampaignVideos(
  params: ActiveVideoParams,
): Promise<ActiveCampaignVideo[]> {
  const { data } = await apiClient.get<{ data: ActiveCampaignVideo[] }>(
    '/campaigns/active',
    { params },
  )
  return data.data
}
