import {
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { products } from './products.js'

/**
 * What a component sits in the box as.
 *
 * The box and its filling are ordinary products in the `packaging` and
 * `filling-materials` categories, so the role is what tells the builder which
 * slot a component fills when a bundle is opened for customisation.
 */
export type ComponentRole = 'item' | 'packaging' | 'filling'

/**
 * The contents of a pre-configured box.
 *
 * A bundle product (`products.kind = 'bundle'`) has its own price, picture and
 * tags; this table is the parts list behind it. Kept as rows rather than a
 * jsonb array on the product because the builder, the order pricer and the
 * dashboard all need to join back to live product rows — quantities and prices
 * of the parts are read far more often than the bundle itself changes.
 *
 * `component_id` restricts on delete: a product still sitting inside a sold
 * bundle must not disappear from under it.
 */
export const productComponents = pgTable(
  'product_components',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bundleId: uuid('bundle_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    componentId: uuid('component_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull().default(1),
    role: text('role').$type<ComponentRole>().notNull().default('item'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    uniqueIndex('product_components_bundle_component_idx').on(
      table.bundleId,
      table.componentId,
    ),
    index('product_components_bundle_idx').on(table.bundleId),
  ],
)

export type ProductComponent = typeof productComponents.$inferSelect
export type NewProductComponent = typeof productComponents.$inferInsert
