import type { GraduatedPrice } from '../db/schema/index.js'

/**
 * The supplier's volume table, in the shape we store.
 *
 * The API sends `{ firstUnit, lastUnit, price }`. A `lastUnit` of 0, or one
 * below `firstUnit`, marks the open-ended top tier. Tiers come back sorted by
 * where they start, with any that cannot be used (no price, no start) dropped.
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
    .sort((a, b) => a.minQty - b.minQty)
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
  const tier = tiers.find(
    (t) => quantity >= t.minQty && (t.maxQty === null || quantity <= t.maxQty),
  )
  return tier ? tier.price : basePrice
}

/** The fulfilment centre's pick fee: the first item into a box, then each one after. */
export const PICK_FEE_FIRST = 0.3
export const PICK_FEE_NEXT = 0.15

/**
 * What packing one box costs: €0.30 for the first item picked into it and
 * €0.15 for each one after. Items are what goes into the box — every product
 * unit, the greeting card, the sticker; not the box itself or its filling.
 * Part of the box's price; never shown as a line of its own.
 */
export function pickFee(picks: number): number {
  if (picks <= 0) return 0
  return Math.round((PICK_FEE_FIRST + PICK_FEE_NEXT * (picks - 1)) * 100) / 100
}
