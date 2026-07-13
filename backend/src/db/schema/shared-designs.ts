import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { products } from './products.js'

/** Brand snapshot stored on a share so the public viewer is self-contained. */
export interface ShareBrand {
  companyName?: string | null
  logo?: string | null
  logoType?: string | null
  primaryColor?: string | null
}

/**
 * A shareable, configured product image. Generated images land here as
 * `pending` — they live OUTSIDE the catalog (never written to `products` or
 * `brand_customizations`), so they never appear in a product response until
 * the user saves them. The `slug` backs a public link to a branded viewer;
 * the `brand` snapshot lets that viewer render the shop's logo/colors without
 * a session (the approver is usually not logged in).
 */
export const sharedDesigns = pgTable(
  'shared_designs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    productId: uuid('product_id').references(() => products.id, {
      onDelete: 'cascade',
    }),
    domain: text('domain'),
    imageUrl: text('image_url').notNull(),
    title: text('title'),
    prompt: text('prompt'),
    brand: jsonb('brand').$type<ShareBrand>(),
    status: text('status').notNull().default('pending'), // 'pending' | 'saved'
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('shared_designs_product_idx').on(table.productId)],
)

export type SharedDesign = typeof sharedDesigns.$inferSelect
export type NewSharedDesign = typeof sharedDesigns.$inferInsert
