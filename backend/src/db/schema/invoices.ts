import {
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { orders } from './orders.js'

/**
 * An invoice, issued when a super admin confirms an order.
 *
 * One per order. Everything printed on it is copied here at the moment it is
 * issued — our company details, the buyer, the lines and the totals — so the PDF
 * rendered from this row is the same document next year, whatever has changed
 * in the catalogue or the config since. Nothing on it is edited afterwards; a
 * mistake is corrected with a credit note, not by rewriting the row.
 */
export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    /** `RE-2026-00001` — see `nextInvoiceNumber`. */
    number: text('number').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    seller: jsonb('seller').$type<InvoiceSeller>().notNull(),
    buyer: jsonb('buyer').$type<InvoiceBuyer>().notNull(),
    lines: jsonb('lines').$type<InvoiceLine[]>().notNull(),
    net: numeric('net', { precision: 10, scale: 2 }).notNull(),
    vatRate: numeric('vat_rate', { precision: 5, scale: 2 }).notNull(),
    vat: numeric('vat', { precision: 10, scale: 2 }).notNull(),
    gross: numeric('gross', { precision: 10, scale: 2 }).notNull(),
    currency: text('currency').notNull(),
    locale: text('locale').notNull().default('de'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('invoices_order_idx').on(table.orderId),
    uniqueIndex('invoices_number_idx').on(table.number),
  ],
)

/** The running invoice number, one row per series (`RE-2026`). */
export const invoiceCounters = pgTable('invoice_counters', {
  series: text('series').primaryKey(),
  last: integer('last').notNull().default(0),
})

/** Our side of the invoice, as it stood when it was issued. */
export interface InvoiceSeller {
  name: string
  street: string
  zip: string
  city: string
  country: string
  email?: string | null
  phone?: string | null
  website?: string | null
  vatId?: string | null
  taxNumber?: string | null
  registerCourt?: string | null
  registerNumber?: string | null
  managingDirectors?: string | null
  bankName?: string | null
  iban?: string | null
  bic?: string | null
  paymentTermDays: number
}

export interface InvoiceBuyer {
  company: string
  name?: string | null
  street: string
  line2?: string | null
  zip: string
  city: string
  country: string
  vatId?: string | null
  poNumber?: string | null
  email: string
  orderReference: string
  /** When the goods are needed — printed as the delivery date. */
  deliveryDate?: string | null
  /**
   * Where the goods go, printed next to the billing address. Absent on
   * invoices issued before it was recorded and when it ships to the billing
   * address; the billing address is printed in its place then.
   */
  shipping?: InvoiceAddress | null
}

/** A postal address as printed on an invoice. */
export interface InvoiceAddress {
  name?: string | null
  company?: string | null
  street: string
  line2?: string | null
  zip: string
  city: string
  /** ISO 3166-1 alpha-2. */
  country: string
}

export interface InvoiceLine {
  description: string
  /** What is inside a box, as one short line under its name. */
  details?: string | null
  sku?: string | null
  quantity: number
  unitPrice: number
  total: number
}

export type Invoice = typeof invoices.$inferSelect
export type NewInvoice = typeof invoices.$inferInsert
