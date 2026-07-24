import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { companies } from './companies.js'
import { products } from './products.js'

/**
 * Per-company gallery of generated product images. Unlike `brand_customizations`
 * (one auto-branded hero per company+product, produced at login/onboarding),
 * this holds MANY dashboard-generated images per company for the same product.
 *
 * Isolation: the shop overlay reads only the logged-in user's company rows, so
 * a given company's generated images appear ONLY to that company's employees —
 * and the same product can carry a separate set of images for every company.
 */
export const companyProductImages = pgTable(
  'company_product_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    imageUrl: text('image_url').notNull(),
    prompt: text('prompt'),
    /** Cache-bust key mirroring the design's generation, when known. */
    generation: text('generation'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('company_product_images_company_product_idx').on(
      table.companyId,
      table.productId,
    ),
    // Re-saving the same image for the same company+product is a no-op rather
    // than a duplicate, while still allowing multiple DISTINCT images.
    uniqueIndex('company_product_images_unique_idx').on(
      table.companyId,
      table.productId,
      table.imageUrl,
    ),
  ],
)

export type CompanyProductImage = typeof companyProductImages.$inferSelect
export type NewCompanyProductImage = typeof companyProductImages.$inferInsert
