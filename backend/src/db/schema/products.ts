import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { categories } from './categories.js'

/** An ordinary item, or a pre-configured box made of other items. */
export type ProductKind = 'single' | 'bundle'

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
    images: jsonb('images').$type<string[]>().notNull().default([]),
    customizedImage: text('customized_image'),
    description: text('description').notNull().default(''),
    details: jsonb('details').$type<string[]>().notNull().default([]),
    isFeatured: boolean('is_featured').notNull().default(false),
    /**
     * `single` is an ordinary catalogue item. `bundle` is a pre-configured box:
     * it has its own price and picture, and its contents live in
     * `product_components`. A bundle is never a component of another bundle.
     */
    kind: text('kind').$type<ProductKind>().notNull().default('single'),
    /**
     * Lowercase slugs for occasion/use-case filtering — `christmas`, `welcome`.
     * A product has one category but belongs to any number of occasions, which
     * is what a landing page filters on.
     */
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    /** Smallest order the supplier accepts. 1 unless someone says otherwise. */
    minQuantity: integer('min_quantity').notNull().default(1),
    // Dominant color for brand-color similarity filtering. `dominant_color` is
    // the display hex; `color_l/a/b` are its CIELAB coordinates, so proximity
    // sorting is a plain Euclidean (ΔE) distance in a perceptual color space.
    dominantColor: text('dominant_color'),
    colorL: real('color_l'),
    colorA: real('color_a'),
    colorB: real('color_b'),
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
    index('products_kind_idx').on(table.kind),
  ],
)

export type Product = typeof products.$inferSelect
export type NewProduct = typeof products.$inferInsert
