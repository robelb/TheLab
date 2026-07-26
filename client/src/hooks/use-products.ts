import { useMutation, useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  fetchProducts,
  fetchProductsByIds,
  searchProductsByImage,
  type FetchProductsParams,
  type ImageSearchParams,
} from '@/api/products'

export const productsKeys = {
  all: ['products'] as const,
  list: (params: FetchProductsParams) => ['products', 'list', params] as const,
  detail: (id: string) => ['products', 'detail', id] as const,
  byIds: (ids: string) => ['products', 'by-ids', ids] as const,
}

/**
 * Live data for a known set of product ids. Sits under the `['products']` key
 * so logging in/out — and the company's branded images becoming ready —
 * invalidates it like every other product read.
 */
export function useProductsByIds(ids: string[]) {
  // Sorted key: reordering the cart must not trigger a refetch.
  const cacheKey = [...ids].sort().join(',')
  return useQuery({
    queryKey: productsKeys.byIds(cacheKey),
    queryFn: () => fetchProductsByIds(ids),
    enabled: ids.length > 0,
    staleTime: 60_000,
  })
}

export function useProducts(params: FetchProductsParams) {
  return useQuery({
    queryKey: productsKeys.list(params),
    queryFn: () => fetchProducts(params),
    placeholderData: keepPreviousData,
  })
}

/**
 * Image search runs on explicit submit (an upload), so it's a mutation rather
 * than a query — the caller holds onto the returned results to render them.
 */
export function useImageSearch() {
  return useMutation({
    mutationFn: (params: ImageSearchParams) => searchProductsByImage(params),
  })
}
