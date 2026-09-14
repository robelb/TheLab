import { useQuery } from '@tanstack/react-query'
import { fetchCollection, fetchCollections } from '@/api/collections'

export const collectionKeys = {
  all: ['collections'] as const,
  detail: (slug: string) => ['collections', 'detail', slug] as const,
}

export function useCollection(slug: string | undefined) {
  return useQuery({
    queryKey: collectionKeys.detail(slug ?? ''),
    queryFn: () => fetchCollection(slug!),
    enabled: Boolean(slug),
    // Marketing copy changes between campaigns, not between page views.
    staleTime: 5 * 60_000,
    retry: false,
  })
}

export function useCollections() {
  return useQuery({
    queryKey: collectionKeys.all,
    queryFn: fetchCollections,
    staleTime: 5 * 60_000,
  })
}
