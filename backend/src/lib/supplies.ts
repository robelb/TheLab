/**
 * Fulfilment supplies: the gift box itself and the filling material packed
 * around the products. They're ordinary rows in `products` — same cart, same
 * pricing, same order — but they belong to *building* a box rather than to the
 * catalog, so every shop-facing read excludes their categories and only the box
 * builder asks for them (`GET /api/products/supplies`).
 *
 * This list is the single source of truth for "not a shop category". To add
 * another supply type later (tissue paper, closure stickers), add its slug here
 * and seed products under it — nothing else needs to change.
 */
export const PACKAGING_SLUG = 'packaging'
export const FILLING_SLUG = 'filling-materials'

export const SUPPLY_CATEGORIES: { slug: string; name: string }[] = [
  { slug: PACKAGING_SLUG, name: 'Packaging' },
  { slug: FILLING_SLUG, name: 'Filling materials' },
]

export const SUPPLY_CATEGORY_SLUGS: string[] = SUPPLY_CATEGORIES.map(
  (c) => c.slug,
)

export function isSupplyCategory(slug: string): boolean {
  return SUPPLY_CATEGORY_SLUGS.includes(slug)
}

/**
 * `c.slug NOT IN (...)` for the two hand-written SQL queries. Built from the
 * constant above, so there is no caller-supplied input in it.
 */
const quoted = SUPPLY_CATEGORY_SLUGS.map(
  (slug) => `'${slug.replace(/'/g, "''")}'`,
).join(', ')

export const NOT_SUPPLY_SQL = `c.slug NOT IN (${quoted})`
