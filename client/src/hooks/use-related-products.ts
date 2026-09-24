import { useQuery } from '@tanstack/react-query'
import { fetchRelatedProducts } from '@/api/products'

/**
 * Products like this one.
 *
 * `tag` narrows them to a landing page's range; `null` means a range applies
 * but has not loaded yet, and waits rather than suggesting the whole catalogue.
 */
export function useRelatedProducts(
  productId: string | undefined,
  limit = 4,
  tag?: string | null,
) {
  return useQuery({
    queryKey: ['products', 'related', productId, limit, tag ?? ''],
    queryFn: () => fetchRelatedProducts(productId!, limit, tag ?? undefined),
    enabled: Boolean(productId) && tag !== null,
  })
}
