import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { products } from './products.js'

export const brandCustomizations = pgTable(
  'brand_customizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    domain: text('domain').notNull(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    imageUrl: text('image_url').notNull(),
    generation: text('generation').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('brand_customizations_domain_product_idx').on(
      table.domain,
      table.productId,
    ),
  ],
)

export type BrandCustomization = typeof brandCustomizations.$inferSelect
export type NewBrandCustomization = typeof brandCustomizations.$inferInsert
