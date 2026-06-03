import { useQuery } from '@tanstack/react-query'
import { fetchProduct } from '@/api/products'
import { productsKeys } from './use-products'

export function useProduct(id: string | undefined, domain?: string) {
  return useQuery({
    queryKey: productsKeys.detail(id ?? '', domain),
    queryFn: () => fetchProduct(id!, domain),
    enabled: Boolean(id),
  })
}
