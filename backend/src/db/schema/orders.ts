import {
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { companies } from './companies.js'
import { users } from './users.js'

/**
 * A request to have a box made.
 *
 * Not a paid order: money and invoicing live outside this app, so what lands
 * here is everything a person needs to price the job and print it — never a
 * charge. The wording in the shop says "request" for the same reason.
 *
 * Until this table existed, a shopper could spend an afternoon and several paid
 * renders designing a box, press the button, and leave nothing behind but an
 * analytics event. The cart lives in one browser's localStorage; this row is the
 * first and only moment any of it reaches us.
 */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    /** Who sent it. Kept even after they leave the company. */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** Short, unambiguous, and sayable over the phone — see `makeReference`. */
    reference: text('reference').notNull().unique(),
    /** new → quoted → confirmed, or cancelled at any point. */
    status: text('status').notNull().default('new'),
    /** Who to reply to: name and email. */
    contact: jsonb('contact').$type<OrderContact>().notNull(),
    /** Where it goes and when it is needed. Absent until someone asks for it. */
    delivery: jsonb('delivery').$type<OrderDelivery | null>(),
    /**
     * The cart exactly as it was sent, boxes and their designs included.
     *
     * Stored whole rather than split into rows because it is a record of what
     * was agreed, not live data. Prices here are the ones the shopper saw; the
     * catalogue moving afterwards must not silently change what they asked for.
     */
    items: jsonb('items').$type<OrderItem[]>().notNull(),
    subtotal: numeric('subtotal', { precision: 10, scale: 2 }).notNull(),
    shipping: numeric('shipping', { precision: 10, scale: 2 }).notNull(),
    total: numeric('total', { precision: 10, scale: 2 }).notNull(),
    currency: text('currency').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('orders_company_created_idx').on(table.companyId, table.createdAt),
  ],
)

export interface OrderContact {
  name: string
  email: string
}

export interface OrderDelivery {
  address?: string | null
  city?: string | null
  zip?: string | null
  country?: string | null
  /** When they need it in hand — the first thing a quote has to answer. */
  neededBy?: string | null
  notes?: string | null
}

/** One cart line. A box carries everything that was built into it. */
export interface OrderItem {
  productId: string
  name: string
  sku?: string | null
  image?: string | null
  unitPrice: number
  quantity: number
  currency?: string | null
  /** Present when this line is a built gift box — mirrors the client's `BoxDetails`. */
  box?: unknown
  /** Present when this single product was branded — placement, brief and logo. */
  design?: unknown
}

export type Order = typeof orders.$inferSelect
export type NewOrder = typeof orders.$inferInsert
