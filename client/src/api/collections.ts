import { apiClient } from '@/lib/api-client'
import type { Product } from '@/types/product'

/** Copy the marketing side writes, in both languages a campaign runs in. */
export interface LocalizedText {
  de: string
  en: string
}

/**
 * A landing page's slice of the shop.
 *
 * An ad click lands on `/c/:slug` and this is everything that page needs: the
 * headline, the boxes to show first, and the tag to filter the rest by.
 */
export interface Collection {
  id: string
  slug: string
  title: LocalizedText
  subtitle: LocalizedText | null
  tag: string
  featuredBundleIds: string[]
  defaultLocale: string
  active: boolean
  sortOrder: number
  featuredBundles: Product[]
}

export async function fetchCollection(slug: string): Promise<Collection> {
  const { data } = await apiClient.get<Collection>(
    `/collections/${encodeURIComponent(slug)}`,
  )
  return data
}

export async function fetchCollections(): Promise<Collection[]> {
  const { data } = await apiClient.get<{ data: Collection[] }>('/collections')
  return data.data
}
