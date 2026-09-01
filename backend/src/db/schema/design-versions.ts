import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { companies } from './companies.js'
import { products } from './products.js'
import type { PlacementLayout } from '../../customizer/placementLayout.js'

/**
 * A saved state of someone's design, whole.
 *
 * A design is not one image, it is a set: the photo it was built on, the flat
 * composite that says exactly what prints, the optional photoreal render, and
 * the layout that produced both. Restoring a render next to a layout that never
 * made it is a mismatch nobody spots until an order ships, so the set is stored
 * and read back together or not at all.
 *
 * This is the first place the *layout* is persisted server-side. Everywhere
 * else — `company_product_images`, `brand_customizations`, `shared_designs` —
 * keeps the resulting picture and throws away the editable state that made it,
 * which is why designs could never be reopened from anywhere but one browser.
 *
 * Company-scoped like the rest of the generated-image tables: a company's
 * versions belong to its own people and nobody else's.
 */
export const designVersions = pgTable(
  'design_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    /** Whatever the person called it. Renameable. */
    label: text('label').notNull(),
    /** The photo the design was built on. Without it nothing can be reopened. */
    sourceImageUrl: text('source_image_url').notNull(),
    /**
     * The flat composite — exactly what prints.
     *
     * Nullable because a design briefed purely in words never produces one:
     * there is nothing to composite and the render *is* the design. The service
     * requires at least one of the two pictures.
     */
    flatImageUrl: text('flat_image_url'),
    /** The photoreal render, when one was made. A presentation of the design. */
    photorealImageUrl: text('photoreal_image_url'),
    prompt: text('prompt'),
    layout: jsonb('layout').$type<PlacementLayout | null>(),
    /** A mark used instead of the company logo for this design only. */
    logoUrl: text('logo_url'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('design_versions_company_product_idx').on(
      table.companyId,
      table.productId,
    ),
  ],
)

export type DesignVersion = typeof designVersions.$inferSelect
export type NewDesignVersion = typeof designVersions.$inferInsert
