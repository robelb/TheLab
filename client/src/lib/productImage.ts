import type { Product } from '@/types/product'

/** Product image for display; busts cache when the user logs in with a new domain. */
export function getProductDisplayImage(
  product: Product,
  cacheKey?: string | null,
): string {
  const base = product.customizedImage ?? product.image
  if (!product.customizedImage || !cacheKey) return base

  const separator = base.includes('?') ? '&' : '?'
  return `${base}${separator}cb=${encodeURIComponent(cacheKey)}`
}
