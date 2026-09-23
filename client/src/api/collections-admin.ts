import { apiClient } from '@/lib/api-client'
import type { Collection, LocalizedText } from '@/api/collections'
import type { Product } from '@/types/product'

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

/** What currently appears on this collection's page. */
export async function fetchCollectionProducts(
  id: string,
): Promise<Product[]> {
  const { data } = await apiClient.get<{ data: Product[] }>(
    `/collections/${id}/products`,
  )
  return data.data
}

/**
 * Put products into a collection or take them out.
 *
 * Returns the whole membership afterwards, so the screen never has to guess
 * what the change left behind.
 */
export async function setCollectionProducts(
  id: string,
  changes: { add?: string[]; remove?: string[] },
): Promise<Product[]> {
  const { data } = await apiClient.post<{ data: Product[] }>(
    `/collections/${id}/products`,
    changes,
  )
  return data.data
}
