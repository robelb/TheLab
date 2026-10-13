import { GREETING_MAX_LENGTH, type BoxDetails, type BoxLine } from '@/types/box'
import type { BundleComponent, Product } from '@/types/product'
import { pickFee, unitPriceFor } from '@/lib/pricing'

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
 * The live catalogue a cart is priced and checked against: what
 * `/products/by-ids` returned, and which ids it was asked about. An id that
 * was asked about and did not come back is gone from the catalogue; one that
 * was not asked yet (the lookup is still loading) is simply not known.
 */
export interface LiveCatalogue {
  products: ReadonlyMap<string, Product>
  asked: ReadonlySet<string>
}

export interface CartLinePrice {
  /** What one of the line costs — one box, for a box line. */
  unit: number
  /** `unit` times the line's quantity. */
  total: number
  /** How a box line is priced; absent for a single product. */
  pricingMode?: 'bundle' | 'parts'
}

interface PricedLine {
  product: Pick<Product, 'id' | 'price' | 'graduatedPrices' | 'kind'>
  quantity: number
  box?: BoxDetails | null
}

/** How many items go into one box: product units, the card, the sticker. */
function picksOf(box: Pick<BoxDetails, 'lines' | 'greetingCard' | 'stickers'>): number {
  return (
    box.lines.reduce((sum, line) => sum + line.quantity, 0) +
    (box.greetingCard?.quantity ?? 0) +
    (box.stickers?.quantity ?? 0)
  )
}

/**
 * What one cart line costs, worked out the way the server prices the request
 * (`lineTotal` in its orders service) — volume tiers included.
 *
 * - A single product: its catalogue price, tiered by the line's quantity.
 * - A ready-made box kept as sold: the box's own price, tiered by how many
 *   boxes.
 * - Any other box: each part's price, tiered by its units per box times the
 *   boxes, plus packing (`pickFee`) per box.
 *
 * Prices come from `live` wherever it has them. Until it does — the lookup is
 * still loading, or failed — the line shows what it was added at.
 */
export function cartLinePrice(
  line: PricedLine,
  live: LiveCatalogue | undefined,
): CartLinePrice {
  const qty = line.quantity
  const priced = (unit: number, pricingMode?: CartLinePrice['pricingMode']) => ({
    unit,
    total: unit * qty,
    ...(pricingMode ? { pricingMode } : {}),
  })
  const known = (id: string) => Boolean(live?.asked.has(id))

  if (!line.box) {
    const id = baseProductId(line.product.id)
    const source = (known(id) && live!.products.get(id)) || line.product
    return priced(unitPriceFor(source.price, source.graduatedPrices, qty))
  }

  const box = line.box
  const parts = boxAllLines(box)
  // What the line was added at, for while the catalogue is not known yet.
  const stored = () =>
    box.bundleId && line.product.kind === 'bundle'
      ? priced(unitPriceFor(line.product.price, line.product.graduatedPrices, qty), 'bundle')
      : box.bundleId && typeof box.bundlePrice === 'number'
        ? priced(box.bundlePrice, 'bundle')
        : priced(line.product.price, 'parts')

  if (box.bundleId) {
    if (!known(box.bundleId)) return stored()
    const bundle = live!.products.get(box.bundleId)
    // Only an actual bundle, still holding exactly this, has a price to
    // honour; anything else — gone, or changed — is priced by its parts.
    if (bundle?.kind === 'bundle' && bundle.components && sameComposition(parts, bundle.components)) {
      return priced(unitPriceFor(bundle.price, bundle.graduatedPrices, qty), 'bundle')
    }
  }

  if (parts.some((part) => !known(part.productId))) return stored()
  const packing = pickFee(picksOf(box))
  const unit =
    packing +
    parts.reduce((sum, part) => {
      // A part gone from the catalogue is flagged on the line; until it is
      // removed it shows at the price it was added at.
      const source = live!.products.get(part.productId)
      return (
        sum +
        unitPriceFor(
          source?.price ?? part.price,
          source?.graduatedPrices,
          part.quantity * qty,
        ) *
          part.quantity
      )
    }, 0)
  return priced(unit, 'parts')
}

/**
 * Whether the server would refuse this line: its product — or any part of
 * its box — is gone from the catalogue or taken out of sale. A ready-made
 * box's own parts are the exception, as they are on the server
 * (`refuseOutOfSale`): a box can hold parts that are not sold on their own.
 * Only lines the catalogue lookup has answered for are judged.
 */
export function cartLineUnavailable(
  line: Pick<PricedLine, 'product' | 'box'>,
  live: LiveCatalogue | undefined,
): boolean {
  if (!live) return false
  const gone = (id: string, allowInactive = false) => {
    if (!live.asked.has(id)) return false
    const product = live.products.get(id)
    return !product || (product.active === false && !allowInactive)
  }
  if (!line.box) return gone(baseProductId(line.product.id))
  const bundle = line.box.bundleId ? live.products.get(line.box.bundleId) : undefined
  // A ready-made box still as sold is that catalogue box — out of sale, it is
  // not sold (the server refuses it). Changed, only its parts count.
  if (
    bundle?.active === false &&
    bundle.components &&
    sameComposition(boxAllLines(line.box), bundle.components)
  ) {
    return true
  }
  const own = new Set((bundle?.components ?? []).map((c) => c.product.id))
  return boxAllLines(line.box).some((part) => gone(part.productId, own.has(part.productId)))
}

/**
 * The catalogue product a cart line stands for, for links: a ready-made box
 * may sit in the cart under an id of its own (two of the same box with
 * different card messages), so it is reached by its `bundleId`.
 */
export function cartLineCatalogueId(line: {
  product: Pick<Product, 'id'>
  box?: Pick<BoxDetails, 'bundleId'> | null
}): string {
  return line.box?.bundleId ?? baseProductId(line.product.id)
}

/**
 * Separates a cart line's own id from the catalogue id it was made from: a
 * second, different copy of something already in the cart is stored as
 * `<product id>~<suffix>` so the two lines can be told apart.
 */
export const CART_VARIANT_SEPARATOR = '~'

/** The catalogue id behind a cart line's id — see `CART_VARIANT_SEPARATOR`. */
export function baseProductId(cartId: string): string {
  const at = cartId.indexOf(CART_VARIANT_SEPARATOR)
  return at === -1 ? cartId : cartId.slice(0, at)
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

/**
 * A pre-configured box's contents, as box lines the builder and cart use.
 *
 * The greeting card goes in the card slot, where its message lives and where
 * the cart, checkout and the team's order page look for it. (The server checks
 * a box is still "as sold" by its contents, not by slot, so the set price
 * still applies.)
 */
export function bundleToBoxLines(components: BundleComponent[]): {
  lines: BoxLine[]
  packaging: BoxLine | null
  filling: BoxLine | null
  greetingCard: BoxLine | null
} {
  const lines: BoxLine[] = []
  let packaging: BoxLine | null = null
  let filling: BoxLine | null = null
  let greetingCard: BoxLine | null = null

  for (const component of components) {
    const line = toBoxLine(component.product, component.quantity)
    if (component.role === 'packaging') packaging = line
    else if (component.role === 'filling') filling = line
    else if (component.role === 'card' && !greetingCard) greetingCard = line
    else lines.push(line)
  }
  return { lines, packaging, filling, greetingCard }
}

/**
 * A bundle is a box, so it enters the cart as one. `cardMessage` is what the
 * shopper wrote for its greeting card on the product page, if it has one.
 */
export function bundleToBoxDetails(
  bundle: Product,
  options: { cardMessage?: string } = {},
): BoxDetails | null {
  if (bundle.kind !== 'bundle' || !bundle.components?.length) return null
  const { lines, packaging, filling, greetingCard } = bundleToBoxLines(bundle.components)
  return {
    campaignId: null,
    bundleId: bundle.id,
    bundlePrice: bundle.price,
    lines,
    packaging,
    filling,
    ...(greetingCard
      ? {
          greetingCard: {
            ...greetingCard,
            message: (options.cardMessage ?? '').trim().slice(0, GREETING_MAX_LENGTH),
          },
        }
      : {}),
  }
}
