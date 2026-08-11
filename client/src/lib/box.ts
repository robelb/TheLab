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

/** Everything a box charges for: its products, plus the box and the filling. */
export function boxAllLines(
  box: Pick<BoxDetails, 'lines' | 'packaging' | 'filling'>,
): BoxLine[] {
  return [...box.lines, box.packaging, box.filling].filter(
    (line): line is BoxLine => Boolean(line),
  )
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
    customizedImage: product.customizedImage,
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
