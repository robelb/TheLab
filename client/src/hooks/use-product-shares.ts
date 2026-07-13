import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteShare, listProductShares, saveShare } from '@/api/share'
import { productsKeys } from './use-products'

export const productSharesKey = (productId: string) =>
  ['product-shares', productId] as const

/** All generated designs for a product (dashboard-only), newest first. */
export function useProductShares(productId: string) {
  return useQuery({
    queryKey: productSharesKey(productId),
    queryFn: () => listProductShares(productId),
    enabled: Boolean(productId),
  })
}

/** Invalidate the design list plus every catalog-facing product cache. */
function useInvalidateShares(productId: string) {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: productSharesKey(productId) })
    queryClient.invalidateQueries({ queryKey: productsKeys.all })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }
}

/** Save a design → attaches its image to the product gallery, flips to saved. */
export function useSaveShare(productId: string) {
  const invalidate = useInvalidateShares(productId)
  return useMutation({
    mutationFn: (slug: string) => saveShare(slug),
    onSuccess: invalidate,
  })
}

export function useDeleteShare(productId: string) {
  // Delete also strips the image from the product gallery, so refresh the
  // product caches alongside the design list.
  const invalidate = useInvalidateShares(productId)
  return useMutation({
    mutationFn: (slug: string) => deleteShare(slug),
    onSuccess: invalidate,
  })
}
