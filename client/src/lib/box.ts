import type { BoxDetails, BoxLine } from '@/types/box'
import type { Product } from '@/types/product'

/** Marks a cart line as a client-side built box rather than a catalog product. */
export const BOX_SKU_PREFIX = 'BOX-'

/**
 * The two supply categories a box is assembled from. They're ordinary products
 * server-side, kept out of the shop by an `isSupply` flag on the category and
 * fetched only by the builder — these slugs sort them into their two pickers.
 */
export const PACKAGING_SLUG = 'packaging'
export const FILLING_SLUG = 'filling-materials'

export function isBoxSku(sku?: string): boolean {
  return Boolean(sku?.startsWith(BOX_SKU_PREFIX))
}

/** A box-building material rather than something the shop sells. */
export function isSupplyCategory(slug?: string | null): boolean {
  return slug === PACKAGING_SLUG || slug === FILLING_SLUG
}

const KNOWN_BOX_COLORS: Record<string, string> = {
  natural: 'natural',
  natur: 'natural',
  white: 'white',
  'weiß': 'white',
  black: 'black',
  schwarz: 'black',
  kraft: 'kraft',
  brown: 'brown',
}

/**
 * Which base colours a box comes in, scanned out of its supplier description
 * ("available in the basic colors natural, white or black"). A heuristic over
 * prose, so it only ever offers choices — the shopper can still describe any
 * finish they want in the prompt. Mirrors `boxColorOptions` on the server.
 */
/**
 * Whether this box is printed edge to edge — its colour is part of the design
 * rather than fixed stock. Mirrors `boxPrintCapability` on the server, which is
 * what actually drives the generation.
 */
export function isFullColourBox(
  name?: string | null,
  description?: string | null,
): boolean {
  return /full[- ]colou?r/.test(`${name ?? ''} ${description ?? ''}`.toLowerCase())
}

export function boxColorOptions(description?: string | null): string[] {
  if (!description) return []
  const text = description.toLowerCase()
  const found = new Set<string>()
  for (const [needle, color] of Object.entries(KNOWN_BOX_COLORS)) {
    if (new RegExp(`\\b${needle}\\b`).test(text)) found.add(color)
  }
  return [...found]
}

/**
 * What one cart line costs.
 *
 * A box is priced from its contents rather than from its own `price`, which is
 * a figure the builder assembles client-side and which the server ignores when
 * it records a request. Deriving it the same way everywhere is what stops a
 * line disagreeing with the total beside it.
 */
export function cartLineTotal(line: {
  price: number
  quantity: number
  box?: Pick<BoxDetails, 'lines' | 'packaging' | 'filling'> | null
}): number {
  if (!line.box) return line.price * line.quantity
  return boxSubtotal(boxAllLines(line.box)) * line.quantity
}

/** Everything a box charges for: its products, plus the box and the filling. */
export function boxAllLines(
  box: Pick<BoxDetails, 'lines' | 'packaging' | 'filling'>,
): BoxLine[] {
  return [...box.lines, box.packaging, box.filling].filter(
    (line): line is BoxLine => Boolean(line),
  )
}

/**
 * Free over this, a flat fee under it.
 *
 * Mirrors `FREE_SHIPPING_THRESHOLD` / `FLAT_SHIPPING` in the server's orders
 * service, which is what a request is actually priced with. This copy exists so
 * the cart and checkout can show the figure before anything is sent — it used to
 * be the same expression pasted into both pages, which meant they could disagree
 * about what somebody owed.
 */
export const FREE_SHIPPING_THRESHOLD = 200
export const FLAT_SHIPPING = 12

export function shippingFor(subtotal: number): number {
  return subtotal >= FREE_SHIPPING_THRESHOLD || subtotal === 0 ? 0 : FLAT_SHIPPING
}

/** What the given lines cost together — unit price times how many of each. */
export function boxSubtotal(lines: BoxLine[]): number {
  return lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
}

/**
 * Products in one box — the box's own cart quantity is counted separately, and
 * so are the supplies, which aren't gifts.
 */
export function boxPieceCount(lines: BoxLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0)
}

export function toBoxLine(product: Product, quantity: number): BoxLine {
  return {
    productId: product.id,
    name: product.name,
    price: product.price,
    currency: product.currency,
    quantity,
    image: product.image,
    // Never the catalogue's branded variant — see `BoxLine.customizedImage`.
    // A box line only carries an image the shopper designed themselves, which
    // the builder fills in from the draft.
    customizedImage: null,
  }
}

/** Two boxes hold the same thing — same products, same order, same counts. */
export function sameBoxLines(a: BoxLine[], b: BoxLine[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (line, i) =>
        line.productId === b[i].productId &&
        line.quantity === b[i].quantity &&
        line.price === b[i].price,
    )
  )
}
