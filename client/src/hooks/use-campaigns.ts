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
  regenerateCampaignHeroImage,
  type HeroImageSupplies,
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

/**
 * Bundle images render in the background (~30-60s), so poll while any campaign
 * in the result is still waiting on one.
 */
const HERO_IMAGE_POLL_MS = 4000

export function useCampaigns(domain?: string | null) {
  return useQuery({
    queryKey: campaignsKeys.list(domain),
    queryFn: () => fetchCampaigns(domain ?? undefined),
    refetchInterval: (query) =>
      query.state.data?.some((c) => c.heroImageStatus === 'pending')
        ? HERO_IMAGE_POLL_MS
        : false,
  })
}

export function useCampaign(id: string | undefined) {
  return useQuery({
    queryKey: campaignsKeys.detail(id ?? ''),
    queryFn: () => fetchCampaign(id!),
    enabled: Boolean(id),
    refetchInterval: (query) =>
      query.state.data?.heroImageStatus === 'pending'
        ? HERO_IMAGE_POLL_MS
        : false,
  })
}

/** Assemble campaign-generation brand signals from BrandContext + session. */
export function useCampaignBrandSignals(): CampaignBrandSignals {
  const { brand } = useBrand()
  const { domain } = useAuth()
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
      plainUnlessDesigned,
    }: {
      brand: CampaignBrandSignals
      bundleSize?: number
      brief?: string
      /** See `HeroImageSupplies.plainUnlessDesigned`. */
      plainUnlessDesigned?: boolean
    }) => generateCampaign(brand, bundleSize, brief, plainUnlessDesigned),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: campaignsKeys.all }),
  })
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient()
  const brand = useCampaignBrandSignals()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CampaignUpdate }) =>
      // A bundle change re-renders the image server-side — send the brand along
      // so it renders with the logo. Other edits don't, so don't bloat them.
      updateCampaign(id, input.productIds ? { brand, ...input } : input),
    onSuccess: (campaign) => {
      // Seed the detail cache so a bundle change shows its `pending` image state
      // immediately, without waiting for the invalidation round-trip.
      queryClient.setQueryData(campaignsKeys.detail(campaign.id), campaign)
      void queryClient.invalidateQueries({ queryKey: campaignsKeys.all })
    },
  })
}

/**
 * Manual bundle-image regeneration — always available, also after a failure.
 * The caller's live brand rides along so the render gets the logo even when the
 * campaign has no domain for the server to look a company up by.
 */
export function useRegenerateCampaignHeroImage() {
  const queryClient = useQueryClient()
  const brand = useCampaignBrandSignals()
  return useMutation({
    // The box builder passes the chosen box and filling so the bundle photo
    // shows them; the dashboard passes an id alone and gets the house style.
    mutationFn: (input: string | { id: string; supplies?: HeroImageSupplies }) =>
      typeof input === 'string'
        ? regenerateCampaignHeroImage(input, brand)
        : regenerateCampaignHeroImage(input.id, brand, input.supplies),
    onSuccess: (campaign) => {
      queryClient.setQueryData(campaignsKeys.detail(campaign.id), campaign)
      void queryClient.invalidateQueries({ queryKey: campaignsKeys.all })
    },
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
