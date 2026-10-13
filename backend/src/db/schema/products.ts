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

/**
 * One volume tier: from `minQty` units up to `maxQty` (inclusive) each unit
 * costs `price`. `maxQty: null` is open-ended. Net, in the product's currency.
 */
export interface GraduatedPrice {
  minQty: number
  maxQty: number | null
  price: number
}

/** Diet and sourcing badges the add-product modal shows. */
export type ProductLabel = 'vegan' | 'organic'

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
    /** Net price for one unit, and the fallback when no tier applies. */
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    /**
     * The supplier's volume tiers, sorted by `minQty`. Empty when the product
     * has one price for every quantity. See `unitPriceFor` in lib/pricing.ts.
     */
    graduatedPrices: jsonb('graduated_prices')
      .$type<GraduatedPrice[]>()
      .notNull()
      .default([]),
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
     * The proven sellers a box is built from. Separate from `isFeatured`, which
     * is what the shop leads with: the box builder offers these first, and the
     * AI only reaches past them when there are not enough to fill a box.
     */
    isBestSeller: boolean('is_best_seller').notNull().default(false),
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
    /**
     * Badges such as `vegan` and `organic`. Kept apart from `tags` because tags
     * decide which collections a product appears in, and a badge must not.
     */
    labels: jsonb('labels').$type<ProductLabel[]>().notNull().default([]),
    /**
     * When someone last set `labels` by hand in the dashboard. Set means the
     * catalogue resync keeps the hand-picked labels rather than its own.
     */
    labelsEditedAt: timestamp('labels_edited_at', { withTimezone: true }),
    /**
     * For sale. False for a product Endeavour no longer has, or one that
     * arrived without a price: kept for the orders and designs that point at
     * it, hidden from the shop and refused by checkout.
     */
    active: boolean('active').notNull().default(true),
    /** When someone set the price by hand; the resync then keeps it (and the tiers). */
    priceEditedAt: timestamp('price_edited_at', { withTimezone: true }),
    /** When someone changed the tags by hand; the resync then keeps them. */
    tagsEditedAt: timestamp('tags_edited_at', { withTimezone: true }),
    /** Smallest order the supplier accepts. 1 unless someone says otherwise. */
    minQuantity: integer('min_quantity').notNull().default(1),
    /**
     * Everything the supplier catalogue said about this product that has no
     * column of its own — barcode, weights, TARIC, origin, warehouse stock, the
     * source categories and tags, the original HTML copy, and the catalogue
     * sheet row it came from. Kept whole so nothing is lost on import and a
     * later feature can promote a field to a column without re-fetching.
     */
    sourceData: jsonb('source_data').$type<Record<string, unknown>>(),
    /** When `pnpm sync:endeavour` last refreshed this row from the supplier. */
    sourceSyncedAt: timestamp('source_synced_at', { withTimezone: true }),
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
