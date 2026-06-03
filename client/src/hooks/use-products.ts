import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { fetchProducts, type FetchProductsParams } from '@/api/products'

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
