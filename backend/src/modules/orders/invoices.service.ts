/**
 * Issuing invoices for confirmed orders.
 *
 * An invoice is written once, when a super admin confirms an order, from the
 * order's final price. It copies everything it prints — our details, the
 * buyer, the lines — so it can be re-rendered as the same document later.
 */

import { eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  invoiceCounters,
  invoices,
  type Invoice,
  type InvoiceBuyer,
  type InvoiceLine,
  type Order,
} from '../../db/schema/index.js'
import { env } from '../../config/env.js'
import { sellerDetails } from '../../config/seller.js'

/**
 * `RE-2026-00001`: prefix, year, then a running number that restarts each year
 * and is kept per prefix — a `TEST` prefix on a staging deploy has its own.
 *
 * Drawn with one upsert, which is atomic on its own — the Neon HTTP driver has
 * no transactions, and two confirmations landing together must never share a
 * number. A number drawn for an insert that then fails is lost, leaving a gap;
 * that is the price of not having a transaction, and it is rare (see
 * `issueInvoice`, which checks for an existing invoice first).
 */
export async function nextInvoiceNumber(at: Date = new Date()): Promise<string> {
  const series = `${env.INVOICE_NUMBER_PREFIX}-${at.getFullYear()}`
  const [row] = await db
    .insert(invoiceCounters)
    .values({ series, last: 1 })
    .onConflictDoUpdate({
      target: invoiceCounters.series,
      set: { last: sql`${invoiceCounters.last} + 1` },
    })
    .returning({ last: invoiceCounters.last })
  return `${series}-${String(row.last).padStart(5, '0')}`
}

export async function getInvoiceByOrder(orderId: string): Promise<Invoice | null> {
  const [row] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.orderId, orderId))
    .limit(1)
  return row ?? null
}

/** What goes inside a box, as one line of text under its name. */
function boxDetails(box: unknown): string | null {
  if (!box || typeof box !== 'object') return null
  const b = box as {
    lines?: { name: string; quantity: number }[]
    packaging?: { name: string } | null
    filling?: { name: string } | null
  }
  const parts = [
    ...(b.lines ?? []).map((l) => (l.quantity > 1 ? `${l.quantity}× ${l.name}` : l.name)),
    b.packaging?.name,
    b.filling?.name,
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

function money(value: number): number {
  return Math.round(value * 100) / 100 + 0
}

/**
 * Issue the invoice for an order that has just been confirmed.
 *
 * Idempotent: an order that already has one gets that one back, so confirming
 * twice — or a retry after a timeout — never issues a second invoice.
 */
export async function issueInvoice(
  order: Order,
): Promise<{ invoice: Invoice; created: boolean }> {
  const existing = await getInvoiceByOrder(order.id)
  if (existing) return { invoice: existing, created: false }

  const billing = order.billing
  if (!billing) throw new Error('This order has no billing address to invoice')

  const issuedAt = new Date()
  const seller = sellerDetails()
  const dueAt = new Date(issuedAt.getTime() + seller.paymentTermDays * 86_400_000)

  const buyer: InvoiceBuyer = {
    company: billing.company,
    name: billing.name ?? order.contact.name,
    street: billing.street,
    line2: billing.line2 ?? null,
    zip: billing.zip,
    city: billing.city,
    country: billing.country,
    vatId: billing.vatId ?? null,
    poNumber: billing.poNumber ?? null,
    email: billing.email || order.contact.email,
    orderReference: order.reference,
    deliveryDate: order.delivery?.neededBy ?? null,
  }

  const lines: InvoiceLine[] = order.items.map((item) => ({
    description: item.name,
    details: boxDetails(item.box),
    sku: item.sku ?? null,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: money(item.unitPrice * item.quantity),
  }))
  if (Number(order.shipping) > 0) {
    lines.push({
      description: order.locale === 'en' ? 'Shipping' : 'Versand',
      quantity: 1,
      unitPrice: Number(order.shipping),
      total: Number(order.shipping),
    })
  }

  const number = await nextInvoiceNumber(issuedAt)
  try {
    const [row] = await db
      .insert(invoices)
      .values({
        orderId: order.id,
        number,
        issuedAt,
        dueAt,
        seller,
        buyer,
        lines,
        net: order.total,
        vatRate: order.vatRate ?? String(env.VAT_RATE),
        vat: order.vat ?? '0',
        gross: order.totalGross ?? order.total,
        currency: order.currency,
        locale: order.locale === 'en' ? 'en' : 'de',
      })
      .returning()
    return { invoice: row, created: true }
  } catch (err) {
    // Lost a race with a second confirmation: theirs stands.
    const raced = await getInvoiceByOrder(order.id)
    if (raced) return { invoice: raced, created: false }
    throw err
  }
}

export interface InvoiceSummary {
  id: string
  number: string
  issuedAt: string
  dueAt: string
  gross: number
  currency: string
}

export function invoiceSummary(row: Invoice): InvoiceSummary {
  return {
    id: row.id,
    number: row.number,
    issuedAt: row.issuedAt.toISOString(),
    dueAt: row.dueAt.toISOString(),
    gross: Number(row.gross),
    currency: row.currency,
  }
}
