import { useQuery } from '@tanstack/react-query'
import { fetchRelatedProducts } from '@/api/products'

export function useRelatedProducts(productId: string | undefined, limit = 4) {
  return useQuery({
    queryKey: ['products', 'related', productId, limit],
    queryFn: () => fetchRelatedProducts(productId!, limit),
    enabled: Boolean(productId),
  })
}
