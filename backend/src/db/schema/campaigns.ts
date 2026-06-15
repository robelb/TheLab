import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * Auto-assembled "Your Company Kit" starter campaigns.
 * `domain` is nullable so demo/preset-mode campaigns share a null partition.
 * `status` is plain text (codebase convention) — values constrained in Zod.
 */
export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    domain: text('domain'),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    status: text('status').notNull().default('draft'),
    productIds: jsonb('product_ids').$type<string[]>().notNull().default([]),
    heroImageUrl: text('hero_image_url'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('campaigns_domain_idx').on(table.domain)],
)

export type Campaign = typeof campaigns.$inferSelect
export type NewCampaign = typeof campaigns.$inferInsert
