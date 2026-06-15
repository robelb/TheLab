import { apiClient } from '@/lib/api-client'
import type {
  Campaign,
  CampaignBrandSignals,
  CampaignStatus,
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

export async function deleteCampaign(id: string): Promise<void> {
  await apiClient.delete(`/campaigns/${encodeURIComponent(id)}`)
}
