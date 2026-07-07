import { useQuery } from '@tanstack/react-query'
import { fetchActiveCampaignVideos, type ActiveVideoParams } from '@/api/campaigns'

/**
 * Storefront feed of currently-active campaign video ads, optionally ranked by
 * the visitor's browse context (category / search). Cached briefly; ad
 * freshness doesn't need to be real-time.
 */
export function useActiveCampaigns(params: ActiveVideoParams) {
  return useQuery({
    queryKey: ['campaigns', 'active', params],
    queryFn: () => fetchActiveCampaignVideos(params),
    staleTime: 5 * 60 * 1000,
  })
}
