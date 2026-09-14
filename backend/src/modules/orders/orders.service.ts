/**
 * Requests for a box, and the money arithmetic behind them.
 *
 * Every read and write is scoped by company as well as by id, so a request can
 * only be seen or changed by the company that sent it.
 */

import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { orders, products } from '../../db/schema/index.js'
import { getBundleComponents } from '../products/products.service.js'
import { enqueueLeadEvent } from '../../services/leadIntake.js'
import type { BundleComponent } from '../../types/product.js'
import type { CreateOrderBody, OrderStatus } from './orders.schema.js'

/**
 * Free over this, flat fee under it.
 *
 * This used to be the same expression copy-pasted into the cart page and the
 * checkout page, which meant the two could disagree about what someone owed.
 * It lives here now because this is the only place the number becomes a record.
 */
export const FREE_SHIPPING_THRESHOLD = 200
export const FLAT_SHIPPING = 12

/** Two decimal places, and never `-0`. */
function money(value: number): number {
  return Math.round(value * 100) / 100 + 0
}

/** How a box line was priced, recorded on the stored item. */
export type PricingMode = 'bundle' | 'parts'

type Item = CreateOrderBody['items'][number]
type Box = NonNullable<Item['box']>

/** Everything in a box that is charged: the contents, the box, the filling. */
function boxParts(box: Box) {
  return [...box.lines, box.packaging, box.filling].filter(
    (line): line is NonNullable<typeof line> => Boolean(line),
  )
}

/** Product id → total quantity, so two lists can be compared as sets. */
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
 * Whether a box is still the bundle it was opened from.
 *
 * Order-independent and role-blind: the packaging and the filling are products
 * like any other, so what matters is that the same ids appear in the same
 * quantities. Swap a mug for a bottle, or ask for two instead of one, and this
 * is false — the sticker price stops applying and the box is charged by parts.
 */
function sameComposition(
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

/** A bundle's own price and contents, keyed by id. */
interface BundleFacts {
  prices: Map<string, number>
  components: Map<string, BundleComponent[]>
}

async function loadBundles(items: Item[]): Promise<BundleFacts> {
  const ids = [
    ...new Set(
      items
        .map((i) => i.box?.bundleId)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  if (ids.length === 0) {
    return { prices: new Map(), components: new Map() }
  }

  const [rows, components] = await Promise.all([
    db
      .select({ id: products.id, price: products.price, kind: products.kind })
      .from(products)
      .where(inArray(products.id, ids)),
    getBundleComponents(ids),
  ])

  const prices = new Map<string, number>()
  for (const row of rows) {
    // Only an actual bundle has a sticker price to honour.
    if (row.kind === 'bundle') prices.set(row.id, Number(row.price))
  }
  return { prices, components }
}

/**
 * What a line costs, and on what basis.
 *
 * A custom box's price is derived from what is inside it rather than taken on
 * trust: the shop builds that figure client-side, so accepting it would mean
 * storing a number the browser chose.
 *
 * A pre-configured box is the exception, and only while it is untouched. Those
 * are sold at a set price that is deliberately not the sum of its parts, so the
 * price comes from the catalogue row — after checking the contents still match
 * what that row is for. Change anything and it reverts to being priced by
 * parts, which is what the builder shows the shopper as they change it.
 */
function lineTotal(item: Item, bundles: BundleFacts): {
  total: number
  pricingMode?: PricingMode
} {
  if (!item.box) return { total: item.unitPrice * item.quantity }

  const parts = boxParts(item.box)
  const bundleId = item.box.bundleId
  if (bundleId) {
    const price = bundles.prices.get(bundleId)
    const components = bundles.components.get(bundleId)
    if (price !== undefined && components && sameComposition(parts, components)) {
      return { total: price * item.quantity, pricingMode: 'bundle' }
    }
  }

  const boxPrice = parts.reduce(
    (sum, line) => sum + line.price * line.quantity,
    0,
  )
  return { total: boxPrice * item.quantity, pricingMode: 'parts' }
}

export interface PricedOrder {
  subtotal: number
  shipping: number
  total: number
  /** The items as stored: unchanged, plus how each box line was priced. */
  items: Item[]
}

export async function priceOrder(body: CreateOrderBody): Promise<PricedOrder> {
  const bundles = await loadBundles(body.items)

  let running = 0
  const items = body.items.map((item) => {
    const { total, pricingMode } = lineTotal(item, bundles)
    running += total
    return pricingMode ? { ...item, pricingMode } : item
  })

  const subtotal = money(running)
  const shipping =
    subtotal >= FREE_SHIPPING_THRESHOLD || subtotal === 0 ? 0 : FLAT_SHIPPING
  return { subtotal, shipping, total: money(subtotal + shipping), items }
}

/**
 * A reference someone can read down the phone.
 *
 * No vowels and no 0/1/I/O, so it cannot spell anything and cannot be misheard
 * as another character. Six characters over this alphabet is roughly a billion
 * possibilities, and the column is unique, so a clash surfaces as an error
 * rather than as two requests sharing a name.
 */
const REFERENCE_ALPHABET = '23456789BCDFGHJKLMNPQRSTVWXYZ'

function makeReference(): string {
  let out = ''
  for (let i = 0; i < 6; i++) {
    out += REFERENCE_ALPHABET[Math.floor(Math.random() * REFERENCE_ALPHABET.length)]
  }
  return `BLT-${out}`
}

type Row = typeof orders.$inferSelect

export interface OrderDto {
  id: string
  reference: string
  status: OrderStatus
  createdAt: string
  updatedAt: string
  contact: Row['contact']
  delivery: Row['delivery']
  items: Row['items']
  subtotal: number
  shipping: number
  total: number
  currency: string
  /** Null when this came from the funnel with no account behind it. */
  companyId: string | null
  isGuest: boolean
  source: Row['source']
  locale: string
  collectionSlug: string | null
  attribution: Row['attribution']
}

function toDto(row: Row): OrderDto {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status as OrderStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    contact: row.contact,
    delivery: row.delivery,
    items: row.items,
    // `numeric` comes back as a string from the driver; the shop wants numbers.
    subtotal: Number(row.subtotal),
    shipping: Number(row.shipping),
    total: Number(row.total),
    currency: row.currency,
    companyId: row.companyId,
    isGuest: row.userId === null,
    source: row.source,
    locale: row.locale,
    collectionSlug: row.collectionSlug,
    attribution: row.attribution,
  }
}

export async function createOrder(params: {
  /** Null for a guest: the funnel takes people to checkout without an account. */
  companyId: string | null
  userId: string | null
  body: CreateOrderBody
}): Promise<OrderDto> {
  const { body } = params
  const { subtotal, shipping, total, items } = await priceOrder(body)

  const [row] = await db
    .insert(orders)
    .values({
      companyId: params.companyId,
      userId: params.userId,
      reference: makeReference(),
      status: 'new',
      contact: body.contact,
      delivery: body.delivery ?? null,
      items: items as Row['items'],
      subtotal: subtotal.toFixed(2),
      shipping: shipping.toFixed(2),
      total: total.toFixed(2),
      currency: body.currency,
      source: body.source,
      locale: body.locale,
      collectionSlug: body.collectionSlug ?? null,
      attribution: body.attribution ?? null,
    })
    .returning()

  const dto = toDto(row)
  // Queued, never awaited: the shopper is waiting on this response and the
  // marketing endpoint is not ours to depend on.
  void enqueueLeadEvent('order.created', leadPayload(dto, 'order.created'))
  return dto
}

/**
 * What the marketing side is sent about a request.
 *
 * Enough to score a lead and attribute it to a click: who they are, where they
 * came from, what they asked for and what it comes to. Deliberately not sent:
 * design layouts, generated artwork, delivery addresses — none of it helps an
 * ad platform, and all of it is somebody's business.
 */
function leadPayload(
  order: OrderDto,
  event: 'order.created' | 'order.status_changed',
  previousStatus?: OrderStatus,
): Record<string, unknown> {
  return {
    event,
    occurredAt: new Date().toISOString(),
    lead: {
      name: order.contact.name,
      email: order.contact.email,
      company: order.contact.company ?? null,
      phone: order.contact.phone ?? null,
      locale: order.locale,
      isGuest: order.isGuest,
    },
    attribution: order.attribution ?? null,
    order: {
      id: order.id,
      reference: order.reference,
      status: order.status,
      previousStatus: previousStatus ?? null,
      source: order.source,
      collectionSlug: order.collectionSlug,
      currency: order.currency,
      subtotal: order.subtotal,
      shipping: order.shipping,
      total: order.total,
      itemCount: order.items.length,
      items: order.items.map((item) => ({
        name: item.name,
        sku: item.sku ?? null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        isBox: Boolean(item.box),
        bundleId:
          (item.box as { bundleId?: string | null } | undefined)?.bundleId ??
          null,
        pricingMode: item.pricingMode ?? null,
      })),
    },
  }
}

/** Newest first — the team works the top of this list. */
export async function listOrders(params: {
  companyId: string | null
}): Promise<OrderDto[]> {
  // A null company means a global administrator, who sees everything.
  const rows = params.companyId
    ? await db
        .select()
        .from(orders)
        .where(eq(orders.companyId, params.companyId))
        .orderBy(desc(orders.createdAt))
    : await db.select().from(orders).orderBy(desc(orders.createdAt))
  return rows.map(toDto)
}

export async function getOrder(params: {
  companyId: string | null
  orderId: string
}): Promise<OrderDto | null> {
  const where = params.companyId
    ? and(eq(orders.id, params.orderId), eq(orders.companyId, params.companyId))
    : eq(orders.id, params.orderId)
  const [row] = await db.select().from(orders).where(where)
  return row ? toDto(row) : null
}

export async function setOrderStatus(params: {
  companyId: string | null
  orderId: string
  status: OrderStatus
}): Promise<OrderDto | null> {
  const where = params.companyId
    ? and(eq(orders.id, params.orderId), eq(orders.companyId, params.companyId))
    : eq(orders.id, params.orderId)

  // Read first so the event can say what it moved from — `quoted → confirmed`
  // is the signal the ads side scores a lead on, and a bare "confirmed" with no
  // previous state cannot be told apart from a correction.
  const previous = await getOrder({
    companyId: params.companyId,
    orderId: params.orderId,
  })

  const [row] = await db
    .update(orders)
    .set({ status: params.status, updatedAt: new Date() })
    .where(where)
    .returning()
  if (!row) return null

  const dto = toDto(row)
  if (previous?.status !== dto.status) {
    void enqueueLeadEvent(
      'order.status_changed',
      leadPayload(dto, 'order.status_changed', previous?.status),
    )
  }
  return dto
}
