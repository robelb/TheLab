/**
 * Requests for a box, and the money arithmetic behind them.
 *
 * Every read and write is scoped by company as well as by id, so a request can
 * only be seen or changed by the company that sent it.
 */

import { and, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  collections,
  invoices,
  orderEmailKinds,
  orders,
  outboundEvents,
  products,
  type OrderDelivery,
  type PaymentStatus,
} from '../../db/schema/index.js'
import { env } from '../../config/env.js'
import { missingSellerDetails } from '../../config/seller.js'
import { getBundleComponents } from '../products/products.service.js'
import { enqueueLeadEvent } from '../../services/leadIntake.js'
import { enqueueEmail, sendEmailNow } from '../../services/mailer.js'
import type { SendOutcome } from '../../services/outbox.js'
import { trackPaymentChange, trackStatusChange } from './orders.analytics.js'
import type { BundleComponent } from '../../types/product.js'
import type {
  ConfirmOrderBody,
  CreateOrderBody,
  OrderStatus,
} from './orders.schema.js'
import {
  getInvoiceByOrder,
  invoiceSummary,
  issueInvoice,
  type InvoiceSummary,
} from './invoices.service.js'

/** A refusal the router turns into an HTTP status rather than a 500. */
export class OrderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message)
  }
}

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
    // The stored unit price is the one the server charged, so the lines always
    // add up to the subtotal — and are what the confirm screen starts from.
    const unitPrice = money(total / item.quantity)
    return pricingMode ? { ...item, unitPrice, pricingMode } : { ...item, unitPrice }
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
  collectionId: string | null
  collectionName: string | null
  attribution: Row['attribution']
  billing: Row['billing']
  paymentMethod: Row['paymentMethod']
  paymentStatus: Row['paymentStatus']
  privacyAcceptedAt: string | null
  /** Set once a super admin has fixed the price. */
  confirmedAt: string | null
  vatRate: number | null
  vat: number | null
  totalGross: number | null
  invoice: InvoiceSummary | null
}

function nullableNumber(value: string | null): number | null {
  return value === null ? null : Number(value)
}

function toDto(row: Row, invoice: InvoiceSummary | null = null): OrderDto {
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
    collectionId: row.collectionId,
    collectionName: row.collectionName,
    attribution: row.attribution,
    billing: row.billing,
    paymentMethod: row.paymentMethod,
    paymentStatus: row.paymentStatus,
    privacyAcceptedAt: row.privacyAcceptedAt?.toISOString() ?? null,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    vatRate: nullableNumber(row.vatRate),
    vat: nullableNumber(row.vat),
    totalGross: nullableNumber(row.totalGross),
    invoice,
  }
}

/**
 * The collection a request is being sent from, checked on the server.
 *
 * The slug comes from the browser, so it is only a claim. An ended or unknown
 * campaign is refused rather than filed under the shop: the shopper was looking
 * at that campaign's page, and a request quietly recorded as something else is
 * one nobody can attribute.
 */
async function resolveCollection(
  slug: string | null | undefined,
): Promise<{ id: string; slug: string; name: string } | null> {
  if (!slug) return null
  const [row] = await db
    .select({
      id: collections.id,
      slug: collections.slug,
      title: collections.title,
      active: collections.active,
    })
    .from(collections)
    .where(eq(collections.slug, slug))
    .limit(1)
  if (!row || !row.active) {
    throw new OrderError(
      'This campaign has ended. Your cart is still here — please send it from the shop.',
      409,
      'collection_unavailable',
    )
  }
  return {
    id: row.id,
    slug: row.slug,
    name: row.title?.de || row.title?.en || row.slug,
  }
}

/** Shipping to the billing address means the delivery block copies it. */
function deliveryFor(body: CreateOrderBody): OrderDelivery | null {
  const d = body.delivery
  if (!d) return null
  if (d.sameAsBilling && body.billing) {
    return {
      ...d,
      sameAsBilling: true,
      address: body.billing.street,
      line2: body.billing.line2 ?? null,
      zip: body.billing.zip,
      city: body.billing.city,
      country: body.billing.country,
    }
  }
  return d
}

export async function createOrder(params: {
  /** Null for a guest: the funnel takes people to checkout without an account. */
  companyId: string | null
  userId: string | null
  body: CreateOrderBody
}): Promise<OrderDto> {
  const { body } = params
  const collection = await resolveCollection(body.collectionSlug)
  const { subtotal, shipping, total, items } = await priceOrder(body)

  const [row] = await db
    .insert(orders)
    .values({
      companyId: params.companyId,
      userId: params.userId,
      reference: makeReference(),
      status: 'new',
      contact: body.contact,
      delivery: deliveryFor(body),
      billing: body.billing ?? null,
      items: items as Row['items'],
      subtotal: subtotal.toFixed(2),
      shipping: shipping.toFixed(2),
      total: total.toFixed(2),
      currency: body.currency,
      source: collection ? 'funnel' : 'storefront',
      locale: body.locale,
      collectionSlug: collection?.slug ?? null,
      collectionId: collection?.id ?? null,
      collectionName: collection?.name ?? null,
      attribution: body.attribution ?? null,
      paymentMethod: body.paymentMethod ?? 'invoice',
      privacyAcceptedAt: body.privacyAccepted ? new Date() : null,
    })
    .returning()

  const dto = toDto(row)
  // Queued, never awaited: the shopper is waiting on this response, and
  // neither the marketing endpoint nor Resend is ours to depend on.
  void enqueueLeadEvent('order.created', leadPayload(dto, 'order.created'))
  trackStatusChange(dto, null)
  void enqueueEmail('email.order_received', { orderId: dto.id })
  void enqueueEmail('email.order_notify', { orderId: dto.id })
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
      collectionId: order.collectionId,
      collectionName: order.collectionName,
      paymentStatus: order.paymentStatus,
      totalGross: order.totalGross,
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

export interface OrderFilters {
  source?: 'storefront' | 'funnel'
  collectionId?: string
  status?: OrderStatus
  paymentStatus?: PaymentStatus
}

function scopeWhere(companyId: string | null, orderId?: string): SQL | undefined {
  const parts: SQL[] = []
  if (companyId) parts.push(eq(orders.companyId, companyId))
  if (orderId) parts.push(eq(orders.id, orderId))
  return parts.length ? and(...parts) : undefined
}

/** Newest first — the team works the top of this list. */
export async function listOrders(params: {
  companyId: string | null
  filters?: OrderFilters
}): Promise<OrderDto[]> {
  const f = params.filters ?? {}
  const parts: SQL[] = []
  // A null company means a global administrator, who sees everything.
  if (params.companyId) parts.push(eq(orders.companyId, params.companyId))
  if (f.source) parts.push(eq(orders.source, f.source))
  if (f.collectionId) parts.push(eq(orders.collectionId, f.collectionId))
  if (f.status) parts.push(eq(orders.status, f.status))
  if (f.paymentStatus) parts.push(eq(orders.paymentStatus, f.paymentStatus))

  const rows = await db
    .select({ order: orders, invoice: invoices })
    .from(orders)
    .leftJoin(invoices, eq(invoices.orderId, orders.id))
    .where(parts.length ? and(...parts) : undefined)
    .orderBy(desc(orders.createdAt))
  return rows.map((r) => toDto(r.order, r.invoice ? invoiceSummary(r.invoice) : null))
}

async function loadRow(companyId: string | null, orderId: string): Promise<Row | null> {
  const [row] = await db.select().from(orders).where(scopeWhere(companyId, orderId))
  return row ?? null
}

export async function getOrder(params: {
  companyId: string | null
  orderId: string
}): Promise<OrderDto | null> {
  const row = await loadRow(params.companyId, params.orderId)
  if (!row) return null
  const invoice = await getInvoiceByOrder(row.id)
  return toDto(row, invoice ? invoiceSummary(invoice) : null)
}

/**
 * Change an order's status or payment status.
 *
 * Confirming is not done here: it fixes the price and issues an invoice, which
 * is `confirmOrder`'s job. Cancelling an invoiced order is refused — the
 * invoice stands until a credit note cancels it.
 */
export async function updateOrder(params: {
  companyId: string | null
  orderId: string
  status?: OrderStatus
  paymentStatus?: PaymentStatus
}): Promise<OrderDto | null> {
  // Read first so the event can say what it moved from — `quoted → confirmed`
  // is the signal the ads side scores a lead on, and a bare "confirmed" with no
  // previous state cannot be told apart from a correction.
  const previous = await getOrder({
    companyId: params.companyId,
    orderId: params.orderId,
  })
  if (!previous) return null

  if (params.status === 'confirmed' && previous.status !== 'confirmed') {
    throw new OrderError(
      'Use "Confirm order" to confirm — it fixes the price and issues the invoice.',
      409,
      'use_confirm',
    )
  }
  if (params.status && params.status !== 'confirmed' && previous.invoice) {
    throw new OrderError(
      `Invoice ${previous.invoice.number} has been issued for this order. It needs a credit note before the order can change status.`,
      409,
      'invoiced',
    )
  }
  if (params.paymentStatus && !previous.invoice) {
    throw new OrderError(
      'There is no invoice to mark as paid yet.',
      409,
      'not_invoiced',
    )
  }

  const [row] = await db
    .update(orders)
    .set({
      ...(params.status ? { status: params.status } : {}),
      ...(params.paymentStatus ? { paymentStatus: params.paymentStatus } : {}),
      updatedAt: new Date(),
    })
    .where(scopeWhere(params.companyId, params.orderId))
    .returning()
  if (!row) return null

  const dto = toDto(row, previous.invoice)
  if (previous.status !== dto.status) {
    void enqueueLeadEvent(
      'order.status_changed',
      leadPayload(dto, 'order.status_changed', previous.status),
    )
  }
  trackStatusChange(dto, previous.status)
  trackPaymentChange(dto, previous.paymentStatus)
  return dto
}

/**
 * A due date typed in the confirm dialog, as the moment it is due.
 *
 * Noon UTC, so the calendar date is the same wherever it is printed. Today is
 * allowed (payable on receipt); the past is not, nor anything absurdly far out.
 */
function parseDueDate(value: string): Date {
  const due = new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(due.getTime()) || due.toISOString().slice(0, 10) !== value) {
    throw new OrderError('The due date is not a valid date.', 400, 'due_date')
  }
  const today = new Date().toISOString().slice(0, 10)
  if (value < today) {
    throw new OrderError('The due date cannot be in the past.', 400, 'due_date')
  }
  if (due.getTime() - Date.now() > 365 * 86_400_000) {
    throw new OrderError('The due date must be within a year.', 400, 'due_date')
  }
  return due
}

/**
 * Confirm an order: fix its price, issue the invoice, email it.
 *
 * The request carries the estimate the shop showed. Here a super admin agrees
 * the actual price — per line, and the shipping — and that is what is stored,
 * with the VAT on it. The invoice is then issued from those figures and the
 * customer is sent it.
 *
 * Confirming an order that is already confirmed returns it unchanged, invoice
 * and all: a double click must not issue a second invoice or reprice one that
 * has gone out.
 *
 * `emailDelivery` says whether the invoice email actually went out; it is only
 * there when this call issued the invoice.
 */
export async function confirmOrder(params: {
  orderId: string
  confirmedBy: string
  body: ConfirmOrderBody
}): Promise<(OrderDto & { emailDelivery?: SendOutcome }) | null> {
  const dueAt = params.body.dueDate ? parseDueDate(params.body.dueDate) : undefined
  const row = await loadRow(null, params.orderId)
  if (!row) return null

  const existing = await getInvoiceByOrder(row.id)
  if (row.status === 'confirmed' && existing) {
    return toDto(row, invoiceSummary(existing))
  }
  if (row.status === 'cancelled') {
    throw new OrderError('A cancelled order cannot be confirmed.', 409, 'cancelled')
  }
  // Entered in the confirm dialog when the request came without one.
  const billing = row.billing ?? params.body.billing ?? null
  if (!billing) {
    throw new OrderError(
      'This request has no billing address, so no invoice can be made out. Enter one to confirm.',
      422,
      'no_billing',
    )
  }
  if (billing.country !== 'DE') {
    throw new OrderError('We can only invoice to Germany for now.', 422, 'billing_country')
  }
  const missing = missingSellerDetails()
  if (missing.length) {
    throw new OrderError(
      `Our company details for the invoice are not configured: ${missing.join(', ')}`,
      503,
      'seller_not_configured',
    )
  }

  const prices = new Map(params.body.lines.map((l) => [l.index, l.unitPrice]))
  const items = row.items.map((item, index) => {
    const unitPrice = prices.get(index)
    return unitPrice === undefined ? item : { ...item, unitPrice: money(unitPrice) }
  })

  const subtotal = money(
    items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
  )
  const shipping = money(params.body.shipping)
  const net = money(subtotal + shipping)
  const vatRate = env.VAT_RATE
  const vat = money((net * vatRate) / 100)
  const gross = money(net + vat)

  const [updated] = await db
    .update(orders)
    .set({
      items,
      subtotal: subtotal.toFixed(2),
      shipping: shipping.toFixed(2),
      total: net.toFixed(2),
      vatRate: vatRate.toFixed(2),
      vat: vat.toFixed(2),
      totalGross: gross.toFixed(2),
      ...(row.billing ? {} : { billing }),
      status: 'confirmed',
      paymentStatus: 'unpaid',
      confirmedAt: new Date(),
      confirmedBy: params.confirmedBy,
      updatedAt: new Date(),
    })
    // Only if nobody confirmed it in the meantime.
    .where(and(eq(orders.id, row.id), isNull(orders.confirmedAt)))
    .returning()

  // Someone else got there first; theirs is the price that stands.
  const confirmed = updated ?? (await loadRow(null, row.id))
  if (!confirmed) return null

  // Issued after the price is stored, from the stored row. Should this fail
  // (a crash, the database), confirming again picks up here: the price is
  // already fixed, and the invoice is issued from it.
  const { invoice, created } = await issueInvoice(confirmed, { dueAt })
  const dto = toDto(confirmed, invoiceSummary(invoice))

  if (updated) {
    void enqueueLeadEvent(
      'order.status_changed',
      leadPayload(dto, 'order.status_changed', row.status as OrderStatus),
    )
    trackStatusChange(dto, row.status as OrderStatus)
  }
  // The email goes with the invoice, so it goes once — whichever call made it.
  // Sent now rather than left to the queue, so whoever confirmed hears at once
  // if it did not go out. A failure never undoes the confirmation.
  if (created) {
    return {
      ...dto,
      emailDelivery: await sendEmailNow('email.order_confirmed', { orderId: dto.id }),
    }
  }
  return dto
}

/** Send a customer email again, e.g. after they say it never arrived. */
export async function resendOrderEmail(params: {
  orderId: string
  template: 'received' | 'confirmed'
}): Promise<SendOutcome | null> {
  const row = await loadRow(null, params.orderId)
  if (!row) return null
  if (params.template === 'confirmed' && !(await getInvoiceByOrder(row.id))) {
    throw new OrderError('This order has no invoice to send yet.', 409, 'not_invoiced')
  }
  return sendEmailNow(
    params.template === 'confirmed' ? 'email.order_confirmed' : 'email.order_received',
    { orderId: row.id },
  )
}

export interface OrderEmailDto {
  id: string
  kind: string
  status: string
  attempts: number
  lastError: string | null
  createdAt: string
  sentAt: string | null
  nextAttemptAt: string | null
}

/** Every email queued for an order, newest first — what went out and what did not. */
export async function listOrderEmails(orderId: string): Promise<OrderEmailDto[]> {
  const rows = await db
    .select()
    .from(outboundEvents)
    .where(
      and(
        eq(outboundEvents.target, 'email'),
        inArray(outboundEvents.kind, [...orderEmailKinds]),
        sql`${outboundEvents.payload}->>'orderId' = ${orderId}`,
      ),
    )
    .orderBy(desc(outboundEvents.createdAt))
    .limit(50)
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    attempts: r.attempts,
    lastError: r.lastError,
    createdAt: r.createdAt.toISOString(),
    sentAt: r.sentAt?.toISOString() ?? null,
    nextAttemptAt: r.status === 'pending' ? r.nextAttemptAt.toISOString() : null,
  }))
}
