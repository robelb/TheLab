import {
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { collections } from './collections.js'
import { companies } from './companies.js'
import { users } from './users.js'

/**
 * A request to have a box made.
 *
 * Nothing is charged when it arrives: the shopper asks, and the price they saw
 * is an estimate. A super admin then confirms it — at which point the final
 * price and its VAT are written onto the row and an invoice is issued (see
 * `invoices`). Payment is by bank transfer against that invoice; no money moves
 * through this app. The wording in the shop says "request" for that reason.
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
    /**
     * Null for a guest request. The ad funnel takes people to checkout without
     * an account, so a request can arrive with nothing behind it but the email
     * in `contact` — which is the whole point of the funnel.
     */
    companyId: uuid('company_id').references(() => companies.id, {
      onDelete: 'set null',
    }),
    /** Who sent it. Kept even after they leave the company. Null for guests. */
    userId: uuid('user_id').references(() => users.id),
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
    /** `storefront` is the shop itself; `funnel` came in off a landing page. */
    source: text('source').$type<OrderSource>().notNull().default('storefront'),
    /** Language the request was written in, so the reply matches it. */
    locale: text('locale').notNull().default('en'),
    /** The `/c/:slug` they came through, when they came through one. */
    collectionSlug: text('collection_slug'),
    /**
     * The same collection by id, resolved on the server when the request lands.
     * Null for the shop, and after the collection is deleted.
     */
    collectionId: uuid('collection_id').references(() => collections.id, {
      onDelete: 'set null',
    }),
    /** The collection's title at the time, so the origin reads after renames. */
    collectionName: text('collection_name'),
    /** Who the invoice is made out to. Null on requests sent before checkout asked. */
    billing: jsonb('billing').$type<OrderBilling | null>(),
    /** `invoice` is the only method today; card payments will add to it. */
    paymentMethod: text('payment_method').$type<PaymentMethod | null>(),
    /** Set to `unpaid` on confirmation, then `paid` by hand once money arrives. */
    paymentStatus: text('payment_status').$type<PaymentStatus | null>(),
    /** When the shopper ticked the privacy notice. */
    privacyAcceptedAt: timestamp('privacy_accepted_at', { withTimezone: true }),
    /**
     * Confirmation fixes the price. Until then `subtotal`, `shipping` and
     * `total` are the estimate the shop showed, and the VAT columns are empty.
     */
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    confirmedBy: uuid('confirmed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    vatRate: numeric('vat_rate', { precision: 5, scale: 2 }),
    vat: numeric('vat', { precision: 10, scale: 2 }),
    totalGross: numeric('total_gross', { precision: 10, scale: 2 }),
    /**
     * Where the visit came from: click ids and UTM tags from the last ad click.
     *
     * This is what the ads side needs back to learn which clicks turn into
     * money. Null for anyone who arrived without a campaign on them.
     */
    attribution: jsonb('attribution').$type<OrderAttribution | null>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('orders_company_created_idx').on(table.companyId, table.createdAt),
    index('orders_source_created_idx').on(table.source, table.createdAt),
    index('orders_collection_idx').on(table.collectionId),
  ],
)

export type OrderSource = 'storefront' | 'funnel'
export type PaymentMethod = 'invoice'
export type PaymentStatus = 'unpaid' | 'paid'

export interface OrderContact {
  /** First and last name joined — what every older row and the webhook use. */
  name: string
  firstName?: string | null
  lastName?: string | null
  email: string
  /** Guests have no company record, so they type the name instead. */
  company?: string | null
  phone?: string | null
  position?: string | null
}

/** Who the invoice is made out to. */
export interface OrderBilling {
  company: string
  /** The person it is for the attention of. */
  name?: string | null
  street: string
  line2?: string | null
  zip: string
  city: string
  /** ISO 3166-1 alpha-2. Only `DE` today. */
  country: string
  vatId?: string | null
  /** Their own purchase order number, printed on the invoice. */
  poNumber?: string | null
  /** Where the invoice goes, when that is not the contact's address. */
  email?: string | null
}

/** Campaign data from the last ad click, exactly as the browser saw it. */
export interface OrderAttribution {
  gclid?: string | null
  fbclid?: string | null
  msclkid?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmTerm?: string | null
  utmContent?: string | null
  landingPath?: string | null
  referrer?: string | null
  firstSeenAt?: string | null
  posthogDistinctId?: string | null
  guestSessionId?: string | null
  /** The first collection this browser ever landed on, when it differs. */
  entrySlug?: string | null
}

export interface OrderDelivery {
  /** True when it ships to the billing address; the fields below then copy it. */
  sameAsBilling?: boolean | null
  /** Street and number. */
  address?: string | null
  line2?: string | null
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
  /**
   * How this line was priced: `bundle` means the shopper kept a pre-configured
   * box exactly as sold and paid its sticker price; `parts` means they changed
   * something and it was summed from its contents.
   */
  pricingMode?: 'bundle' | 'parts'
}

export type Order = typeof orders.$inferSelect
export type NewOrder = typeof orders.$inferInsert
