/** The image fields any displayable thing carries — a product or a box line. */
interface ImageSource {
  image: string
  customizedImage?: string | null
}

/** Product image for display; busts cache when the user logs in with a new domain. */
export function getProductDisplayImage(
  product: ImageSource,
  cacheKey?: string | null,
): string {
  const base = product.customizedImage ?? product.image
  if (!product.customizedImage || !cacheKey) return base

  const separator = base.includes('?') ? '&' : '?'
  return `${base}${separator}cb=${encodeURIComponent(cacheKey)}`
}
