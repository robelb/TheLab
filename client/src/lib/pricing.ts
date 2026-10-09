import type { GraduatedPrice } from '@/types/product'

/**
 * What one unit costs when `quantity` of them are bought on one line.
 *
 * Mirrors `unitPriceFor` in the server's lib/pricing.ts, which is what a
 * request is actually priced with; this copy lets the shop show the same
 * figure. The first tier whose range holds the quantity wins; with no tiers,
 * or none that fits, it is the catalogue price. A product in a box counts its
 * units per box times the number of boxes.
 */
export function unitPriceFor(
  basePrice: number,
  tiers: GraduatedPrice[] | null | undefined,
  quantity: number,
): number {
  if (!tiers?.length) return basePrice
  const tier = tiers.find(
    (t) => quantity >= t.minQty && (t.maxQty === null || quantity <= t.maxQty),
  )
  return tier ? tier.price : basePrice
}
