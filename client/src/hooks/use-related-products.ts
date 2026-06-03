import { useQuery } from '@tanstack/react-query'
import { fetchRelatedProducts } from '@/api/products'

export function useRelatedProducts(
  productId: string | undefined,
  limit = 4,
  domain?: string,
) {
  return useQuery({
    queryKey: ['products', 'related', productId, limit, domain],
    queryFn: () => fetchRelatedProducts(productId!, limit, domain),
    enabled: Boolean(productId),
  })
}
