import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export type OutboundEventKind =
  | 'order.created'
  | 'order.status_changed'
  | 'email.order_received'
  | 'email.order_notify'
  | 'email.order_confirmed'
export type OutboundEventStatus = 'pending' | 'sending' | 'sent' | 'failed'

/**
 * Outbound deliveries — webhooks and emails — queued instead of fired.
 *
 * The marketing side feeds these into Google Ads, so a lead that is dropped
 * because their endpoint was restarting is a lead that never optimises a
 * campaign. Writing the row first and sending afterwards means checkout never
 * waits on a third party and never fails because of one.
 *
 * Delivery is at-least-once: a send that times out after the receiver committed
 * is retried, so every request carries `X-Event-Id` for the receiver to dedupe.
 */
export const outboundEvents = pgTable(
  'outbound_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').$type<OutboundEventKind>().notNull(),
    /** Which integration this is bound for: `lead_intake` or `email`. */
    target: text('target').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: text('status')
      .$type<OutboundEventStatus>()
      .notNull()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    /** Held until this moment; how backoff is expressed. */
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (table) => [
    index('outbound_events_due_idx').on(table.status, table.nextAttemptAt),
  ],
)

export type OutboundEvent = typeof outboundEvents.$inferSelect
export type NewOutboundEvent = typeof outboundEvents.$inferInsert
