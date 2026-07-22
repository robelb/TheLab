import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { companies } from './companies.js'
import { products } from './products.js'

export const brandCustomizations = pgTable(
  'brand_customizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Owning company — customized images are scoped per company. Nullable so the
     * migration is non-destructive: pre-existing (domain-only) rows keep NULL and
     * are simply never matched by the company overlay. New customizations always
     * set it, and the unique index below still guarantees one image per
     * (company, product).
     */
    companyId: uuid('company_id').references(() => companies.id, {
      onDelete: 'cascade',
    }),
    /** Retained for reference/debugging; the company is the tenant key. */
    domain: text('domain'),
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
    uniqueIndex('brand_customizations_company_product_idx').on(
      table.companyId,
      table.productId,
    ),
  ],
)

export type BrandCustomization = typeof brandCustomizations.$inferSelect
export type NewBrandCustomization = typeof brandCustomizations.$inferInsert
