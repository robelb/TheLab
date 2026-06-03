import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { categories } from './categories.js'

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: text('source_id').notNull(),
    variantId: text('variant_id'),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    tagline: text('tagline').notNull().default(''),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('EUR'),
    stock: integer('stock').notNull().default(0),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id),
    image: text('image').notNull(),
    customizedImage: text('customized_image'),
    description: text('description').notNull().default(''),
    details: jsonb('details').$type<string[]>().notNull().default([]),
    isFeatured: boolean('is_featured').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('products_sku_idx').on(table.sku),
  ],
)

export type Product = typeof products.$inferSelect
export type NewProduct = typeof products.$inferInsert
