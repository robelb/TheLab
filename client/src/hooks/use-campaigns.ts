import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addCampaignVideo,
  createCampaign,
  deleteCampaign,
  deleteCampaignVideo,
  fetchCampaign,
  fetchCampaigns,
  generateCampaign,
  updateCampaign,
  type CampaignCreate,
  type CampaignUpdate,
  type CampaignVideoInput,
} from '@/api/campaigns'
import { useAuth } from '@/context/AuthContext'
import { useBrand } from '@/context/BrandContext'
import type { CampaignBrandSignals } from '@/types/campaign'

export const campaignsKeys = {
  all: ['campaigns'] as const,
  list: (domain?: string | null) =>
    ['campaigns', 'list', domain ?? 'demo'] as const,
  detail: (id: string) => ['campaigns', 'detail', id] as const,
}

export function useCampaigns(domain?: string | null) {
  return useQuery({
    queryKey: campaignsKeys.list(domain),
    queryFn: () => fetchCampaigns(domain ?? undefined),
  })
}

export function useCampaign(id: string | undefined) {
  return useQuery({
    queryKey: campaignsKeys.detail(id ?? ''),
    queryFn: () => fetchCampaign(id!),
    enabled: Boolean(id),
  })
}

/** Assemble campaign-generation brand signals from BrandContext + session. */
export function useCampaignBrandSignals(): CampaignBrandSignals {
  const { brand } = useBrand()
  const { session } = useAuth()
  const domain = session?.domain ?? null
  return useMemo(
    () => ({
      companyName: brand.companyName,
      description: brand.description,
      industry: brand.industry ?? null,
      keywords: brand.keywords ?? [],
      primaryColor: brand.primaryColor,
      secondaryColor: brand.secondaryColor,
      domain,
      logo: brand.logo,
      logoType: brand.logoType ?? null,
    }),
    [brand, domain],
  )
}

export function useCreateCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CampaignCreate) => createCampaign(input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: campaignsKeys.all }),
  })
}

export function useGenerateCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      brand,
      bundleSize,
      brief,
    }: {
      brand: CampaignBrandSignals
      bundleSize?: number
      brief?: string
    }) => generateCampaign(brand, bundleSize, brief),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: campaignsKeys.all }),
  })
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CampaignUpdate }) =>
      updateCampaign(id, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: campaignsKeys.all }),
  })
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteCampaign(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: campaignsKeys.all }),
  })
}

export function useAddCampaignVideo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      campaignId,
      input,
    }: {
      campaignId: string
      input: CampaignVideoInput
    }) => addCampaignVideo(campaignId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: campaignsKeys.all }),
  })
}

export function useDeleteCampaignVideo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      campaignId,
      videoId,
    }: {
      campaignId: string
      videoId: string
    }) => deleteCampaignVideo(campaignId, videoId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: campaignsKeys.all }),
  })
}
