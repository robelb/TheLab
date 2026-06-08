import { useMutation, useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  fetchProducts,
  searchProductsByImage,
  type FetchProductsParams,
  type ImageSearchParams,
} from '@/api/products'

export const productsKeys = {
  all: ['products'] as const,
  list: (params: FetchProductsParams) => ['products', 'list', params] as const,
  detail: (id: string, domain?: string) =>
    ['products', 'detail', id, domain] as const,
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
