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
  // The tier that starts highest among those holding the quantity — as the
  // server picks it.
  const tier = tiers
    .filter((t) => quantity >= t.minQty && (t.maxQty === null || quantity <= t.maxQty))
    .reduce<GraduatedPrice | null>((best, t) => (!best || t.minQty > best.minQty ? t : best), null)
  return tier ? tier.price : basePrice
}

/** Mirrors the server's pick fee — lib/pricing.ts there. Change both together. */
export const PICK_FEE_FIRST = 0.3
export const PICK_FEE_NEXT = 0.15
/** Cost → sales price, on the pick fee only. Never shown to shoppers. */
export const PICK_FEE_MARKUP = 1.9

/**
 * What packing one box costs the customer: (€0.30 for the first item into it
 * + €0.15 for each after — product units, the card, the sticker) × 1.9.
 * Folded into the box's price; never shown on its own.
 */
export function pickFee(picks: number): number {
  if (picks <= 0) return 0
  const cost = PICK_FEE_FIRST + PICK_FEE_NEXT * (picks - 1)
  return Math.round(cost * PICK_FEE_MARKUP * 100) / 100
}

/** The most of one line a request may hold — the server's limit (orders.schema.ts). */
export const MAX_LINE_QUANTITY = 10_000
