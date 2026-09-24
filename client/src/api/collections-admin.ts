import { apiClient } from '@/lib/api-client'
import type { Collection, LocalizedText } from '@/api/collections'
import type { Product, ProductsPagination } from '@/types/product'

/** What the admin form sends. Every field optional on an update. */
export interface CollectionInput {
  slug: string
  title: LocalizedText
  subtitle?: LocalizedText | null
  tag: string
  featuredBundleIds: string[]
  defaultLocale: 'de' | 'en'
  active: boolean
  allowCustomization: boolean
  sortOrder: number
}

/** Includes the ended ones, which the public read hides. */
export async function fetchAllCollections(): Promise<Collection[]> {
  const { data } = await apiClient.get<{ data: Collection[] }>('/collections', {
    params: { all: 'true' },
  })
  return data.data
}

export async function createCollection(
  input: CollectionInput,
): Promise<Collection> {
  const { data } = await apiClient.post<Collection>('/collections', input)
  return data
}

export async function updateCollection(
  id: string,
  input: Partial<CollectionInput>,
): Promise<Collection> {
  const { data } = await apiClient.patch<Collection>(
    `/collections/${id}`,
    input,
  )
  return data
}

export async function deleteCollection(id: string): Promise<void> {
  await apiClient.delete(`/collections/${id}`)
}

export interface CollectionProductsParams {
  page: number
  limit: number
  q?: string
  kind?: 'single' | 'bundle'
}

export interface CollectionProductsPage {
  data: Product[]
  /** Every id in the collection within `kind`, whatever the page or search. */
  ids: string[]
  pagination: ProductsPagination
}

/** One page of what currently appears on this collection's page. */
export async function fetchCollectionProducts(
  id: string,
  params: CollectionProductsParams,
): Promise<CollectionProductsPage> {
  const { data } = await apiClient.get<CollectionProductsPage>(
    `/collections/${id}/products`,
    {
      params: {
        page: params.page,
        limit: params.limit,
        ...(params.q?.trim() ? { q: params.q.trim() } : {}),
        ...(params.kind ? { kind: params.kind } : {}),
      },
    },
  )
  return data
}

/**
 * Put products into a collection or take them out, any number in one request.
 *
 * Answers with how many actually changed — one already in, or already out,
 * is not counted.
 */
export async function setCollectionProducts(
  id: string,
  changes: { add?: string[]; remove?: string[] },
): Promise<{ added: number; removed: number }> {
  const { data } = await apiClient.post<{ added: number; removed: number }>(
    `/collections/${id}/products`,
    changes,
  )
  return data
}
