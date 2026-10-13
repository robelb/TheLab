import type { GraduatedPrice } from '../db/schema/index.js'

/**
 * The supplier's volume table, in the shape we store.
 *
 * The API sends `{ firstUnit, lastUnit, price }`. A `lastUnit` of 0, or one
 * below `firstUnit`, means "and up". Tiers come back sorted by where they
 * start, and made to fit together:
 * - unusable ones (no price, a price of 0, no start) are dropped — a free tier
 *   is a data error, not a discount;
 * - two that start at the same quantity (JTL sends 0 and 1 for "from one")
 *   keep the first;
 * - an "and up" tier that is not the last, or one that runs into the next,
 *   ends where the next begins. Left open, the first open tier matched every
 *   larger quantity and the discounts above it never applied.
 */
export function normalizeGraduatedPrices(
  tiers: { firstUnit?: number | null; lastUnit?: number | null; price?: number | null }[] | null | undefined,
): GraduatedPrice[] {
  return (tiers ?? [])
    .filter(
      (t) =>
        typeof t.price === 'number' &&
        Number.isFinite(t.price) &&
        t.price >= 0 &&
        typeof t.firstUnit === 'number' &&
        t.firstUnit >= 0,
    )
    .map((t) => {
      const minQty = Math.max(1, Math.floor(t.firstUnit!))
      const last = t.lastUnit ?? 0
      return {
        minQty,
        maxQty: last >= minQty ? Math.floor(last) : null,
        price: Math.round(t.price! * 100) / 100,
      }
    })
    .filter((t) => t.price > 0)
    .sort((a, b) => a.minQty - b.minQty)
    .filter((t, i, all) => i === 0 || t.minQty !== all[i - 1].minQty)
    .map((t, i, all) => {
      const next = all[i + 1]
      if (!next) return t
      const end = next.minQty - 1
      return t.maxQty === null || t.maxQty > end ? { ...t, maxQty: end } : t
    })
}

/**
 * What one unit costs when `quantity` of them are bought on one line.
 *
 * The first tier whose range holds the quantity wins; with no tiers, or none
 * that fits, it is the catalogue price. Tiers are chosen per line and never
 * summed across lines — a product in a box counts its units per box times the
 * number of boxes.
 */
export function unitPriceFor(
  basePrice: number,
  tiers: GraduatedPrice[] | null | undefined,
  quantity: number,
): number {
  if (!tiers?.length) return basePrice
  // The tier that starts highest among those holding the quantity: for tables
  // stored before they were made to fit together, an open lower tier would
  // otherwise shadow the discounts above it.
  const tier = tiers
    .filter((t) => quantity >= t.minQty && (t.maxQty === null || quantity <= t.maxQty))
    .reduce<GraduatedPrice | null>((best, t) => (!best || t.minQty > best.minQty ? t : best), null)
  return tier ? tier.price : basePrice
}

/** The fulfilment centre's pick fee to us: the first item into a box, then each one after. */
export const PICK_FEE_FIRST = 0.3
export const PICK_FEE_NEXT = 0.15
/**
 * What turns that cost into our sales price (Hannes, fulfilment terms). It
 * applies to the pick fee only — products, packaging, filling, cards and
 * stickers carry their own sales prices from the catalogue.
 */
export const PICK_FEE_MARKUP = 1.9

/**
 * What packing one box costs the customer: (€0.30 for the first item picked
 * into it + €0.15 for each one after) × 1.9. Items are what goes into the box
 * — every product unit, the greeting card, the sticker; not the box itself or
 * its filling. Part of the box's price; never shown as a line of its own, and
 * the markup is never shown to the customer.
 */
export function pickFee(picks: number): number {
  if (picks <= 0) return 0
  const cost = PICK_FEE_FIRST + PICK_FEE_NEXT * (picks - 1)
  return Math.round(cost * PICK_FEE_MARKUP * 100) / 100
}
