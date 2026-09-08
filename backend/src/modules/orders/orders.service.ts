/**
 * Requests for a box, and the money arithmetic behind them.
 *
 * Every read and write is scoped by company as well as by id, so a request can
 * only be seen or changed by the company that sent it.
 */

import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { orders } from '../../db/schema/index.js'
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

/**
 * What a line costs.
 *
 * A box's own price is derived from what is inside it rather than taken on
 * trust: the shop builds that figure client-side, so accepting it would mean
 * storing a number the browser chose. The contents, the box and the filling are
 * all charged.
 */
function lineTotal(item: CreateOrderBody['items'][number]): number {
  if (!item.box) return item.unitPrice * item.quantity

  const parts = [...item.box.lines, item.box.packaging, item.box.filling]
  const boxPrice = parts.reduce(
    (sum, line) => (line ? sum + line.price * line.quantity : sum),
    0,
  )
  return boxPrice * item.quantity
}

export function priceOrder(body: CreateOrderBody): {
  subtotal: number
  shipping: number
  total: number
} {
  const subtotal = money(body.items.reduce((sum, i) => sum + lineTotal(i), 0))
  const shipping =
    subtotal >= FREE_SHIPPING_THRESHOLD || subtotal === 0 ? 0 : FLAT_SHIPPING
  return { subtotal, shipping, total: money(subtotal + shipping) }
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
  }
}

export async function createOrder(params: {
  companyId: string
  userId: string
  body: CreateOrderBody
}): Promise<OrderDto> {
  const { body } = params
  const { subtotal, shipping, total } = priceOrder(body)

  const [row] = await db
    .insert(orders)
    .values({
      companyId: params.companyId,
      userId: params.userId,
      reference: makeReference(),
      status: 'new',
      contact: body.contact,
      delivery: body.delivery ?? null,
      items: body.items as Row['items'],
      subtotal: subtotal.toFixed(2),
      shipping: shipping.toFixed(2),
      total: total.toFixed(2),
      currency: body.currency,
    })
    .returning()

  return toDto(row)
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
  const [row] = await db
    .update(orders)
    .set({ status: params.status, updatedAt: new Date() })
    .where(where)
    .returning()
  return row ? toDto(row) : null
}
