import { useQuery } from '@tanstack/react-query'
import { fetchProduct } from '@/api/products'
import { productsKeys } from './use-products'

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: productsKeys.detail(id ?? ''),
    queryFn: () => fetchProduct(id!),
    enabled: Boolean(id),
  })
}
