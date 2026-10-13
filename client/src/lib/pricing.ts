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

/** Mirrors the server's pick fee — lib/pricing.ts there. Change both together. */
export const PICK_FEE_FIRST = 0.3
export const PICK_FEE_NEXT = 0.15

/**
 * What packing one box costs: €0.30 for the first item into it, €0.15 for
 * each after — product units, the card, the sticker. Folded into the box's
 * price; never shown on its own.
 */
export function pickFee(picks: number): number {
  if (picks <= 0) return 0
  return Math.round((PICK_FEE_FIRST + PICK_FEE_NEXT * (picks - 1)) * 100) / 100
}
