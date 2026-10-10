import type { BoxDetails, BoxLine } from '@/types/box'
import type { BundleComponent, Product } from '@/types/product'

/** Marks a cart line as a client-side built box rather than a catalog product. */
export const BOX_SKU_PREFIX = 'BOX-'

/**
 * The two supply categories a box is assembled from. They're ordinary products
 * server-side, kept out of the shop by an `isSupply` flag on the category and
 * fetched only by the builder — these slugs sort them into their two pickers.
 */
export const PACKAGING_SLUG = 'packaging'
export const FILLING_SLUG = 'filling-materials'
/**
 * Greeting cards and logo stickers: supplies too, each picked in a step of
 * the box builder, so the shop's product lists leave them out.
 */
export const GREETING_CARDS_SLUG = 'greeting-cards'
export const STICKERS_SLUG = 'stickers'

/**
 * A supply whose artwork is agreed with the customer after the request —
 * "Eigenes Design" packaging, greeting cards and stickers. That is
 * customising, so a collection with customising off never offers one.
 */
export function isCustomDesignSupply(product: { name: string }): boolean {
  return /eigenes design/i.test(product.name)
}

export function isBoxSku(sku?: string): boolean {
  return Boolean(sku?.startsWith(BOX_SKU_PREFIX))
}

/** A box-building material rather than something the shop sells. */
export function isSupplyCategory(slug?: string | null): boolean {
  return (
    slug === PACKAGING_SLUG ||
    slug === FILLING_SLUG ||
    slug === GREETING_CARDS_SLUG ||
    slug === STICKERS_SLUG
  )
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
  box?: Pick<
    BoxDetails,
    | 'lines'
    | 'packaging'
    | 'filling'
    | 'greetingCard'
    | 'stickers'
    | 'bundleId'
    | 'bundlePrice'
  > | null
}): number {
  if (!line.box) return line.price * line.quantity
  // A ready-made box taken as sold is charged its own price, not the sum of
  // what is in it — those two numbers are deliberately different. The moment
  // the shopper changes anything, the builder clears `bundleId` and this falls
  // back to the parts, which is what the server will price it at too.
  if (line.box.bundleId && typeof line.box.bundlePrice === 'number') {
    return line.box.bundlePrice * line.quantity
  }
  return boxSubtotal(boxAllLines(line.box)) * line.quantity
}

/**
 * Everything a box charges for: its products, plus the box, the filling, the
 * greeting card and the stickers. Mirrors `boxParts` on the server.
 */
export function boxAllLines(
  box: Pick<
    BoxDetails,
    'lines' | 'packaging' | 'filling' | 'greetingCard' | 'stickers'
  >,
): BoxLine[] {
  return [
    ...box.lines,
    box.packaging,
    box.filling,
    box.greetingCard,
    box.stickers,
  ].filter(
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


// ---------------------------------------------------------------------------
// Pre-configured boxes
// ---------------------------------------------------------------------------

/** Product id → total quantity, so two parts lists can be compared as sets. */
function composition(
  parts: { productId: string; quantity: number }[],
): Map<string, number> {
  const map = new Map<string, number>()
  for (const part of parts) {
    map.set(part.productId, (map.get(part.productId) ?? 0) + part.quantity)
  }
  return map
}

/**
 * Whether a box is still the pre-configured one it was opened from.
 *
 * Order-independent and role-blind: the packaging and the filling are products
 * like any other, so what matters is that the same ids appear in the same
 * quantities. Mirrors `sameComposition` in the server's orders service, which
 * is what actually decides the price — this copy exists so the builder can show
 * the shopper the price changing as they change the box.
 */
export function sameComposition(
  parts: { productId: string; quantity: number }[],
  components: BundleComponent[],
): boolean {
  const a = composition(parts)
  const b = composition(
    components.map((c) => ({ productId: c.product.id, quantity: c.quantity })),
  )
  if (a.size !== b.size) return false
  for (const [id, qty] of a) {
    if (b.get(id) !== qty) return false
  }
  return true
}

/**
 * What a box costs: its sticker price while it is untouched, the sum of its
 * parts once it is not.
 *
 * A pre-configured box is sold for less than its contents come to — that is
 * what makes it an offer. Change anything and there is no offer to honour, so
 * it reverts to being priced like any box somebody built themselves.
 */
export function boxPrice(
  lines: BoxLine[],
  bundle?: Pick<Product, 'price' | 'components'> | null,
): { total: number; pricingMode: 'bundle' | 'parts' } {
  if (bundle?.components && sameComposition(lines, bundle.components)) {
    return { total: bundle.price, pricingMode: 'bundle' }
  }
  return { total: boxSubtotal(lines), pricingMode: 'parts' }
}

/** A pre-configured box's contents, as box lines the builder and cart use. */
export function bundleToBoxLines(components: BundleComponent[]): {
  lines: BoxLine[]
  packaging: BoxLine | null
  filling: BoxLine | null
} {
  const lines: BoxLine[] = []
  let packaging: BoxLine | null = null
  let filling: BoxLine | null = null

  for (const component of components) {
    const line = toBoxLine(component.product, component.quantity)
    if (component.role === 'packaging') packaging = line
    else if (component.role === 'filling') filling = line
    else lines.push(line)
  }
  return { lines, packaging, filling }
}

/** A bundle is a box, so it enters the cart as one. */
export function bundleToBoxDetails(bundle: Product): BoxDetails | null {
  if (bundle.kind !== 'bundle' || !bundle.components?.length) return null
  const { lines, packaging, filling } = bundleToBoxLines(bundle.components)
  return {
    campaignId: null,
    bundleId: bundle.id,
    bundlePrice: bundle.price,
    lines,
    packaging,
    filling,
  }
}
