import {
  boolean,
  customType,
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

const vector = customType<{ data: number[]; dpiverName: string }>({
  dataType() {
    return 'vector(768)'
  },
  toDriver(value: number[]) {
    return `[${value.join(',')}]`
  },
  fromDriver(value: unknown) {
    if (typeof value === 'string') {
      return JSON.parse(value.replace('(', '[').replace(')', ']')) as number[]
    }
    return value as number[]
  },
})

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
    embedding: vector('embedding'),
    embeddingUpdatedAt: timestamp('embedding_updated_at', {
      withTimezone: true,
    }),
  },
  (table) => [
    uniqueIndex('products_sku_idx').on(table.sku),
  ],
)

export type Product = typeof products.$inferSelect
export type NewProduct = typeof products.$inferInsert
