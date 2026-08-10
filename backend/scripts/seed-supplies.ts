/**
 * Seed the fulfilment supplies a built box is made of: the boxes themselves and
 * the filling materials that go around the products.
 *
 * They live in `products` like everything else — same cart, same pricing, same
 * order — but under the categories listed in `lib/supplies.ts`, which every
 * shop-facing read filters out. Only the box builder asks for them, via
 * `/api/products/supplies`.
 *
 * Idempotent: matches on SKU, so re-running updates in place.
 *
 *   pnpm db:seed:supplies
 */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { categories, products } from '../src/db/schema/index.js'
import { SUPPLY_CATEGORIES } from '../src/lib/supplies.js'
import { embedText } from '../src/services/embedding.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface RawSupply {
  sourceId: string
  sku: string
  merchantSku: string
  name: string
  tagline: string
  price: number
  currency: string
  categorySlug: string
  image: string
  description: string
  details: string[]
}

/**
 * Supplies are stocked for fulfilment rather than sold from inventory, so they
 * never read as out of stock in the builder.
 */
const SUPPLY_STOCK = 99_999

async function tryEmbed(text: string): Promise<number[] | null> {
  try {
    return await embedText(text)
  } catch (err) {
    console.warn(
      `  embedding failed (${err instanceof Error ? err.message : err}) — continuing without`,
    )
    return null
  }
}

async function seedSupplies() {
  const supplies = JSON.parse(
    readFileSync(path.join(__dirname, '../src/data/supplies.json'), 'utf-8'),
  ) as RawSupply[]

  console.log(`Seeding ${supplies.length} supplies...`)

  // 1. Make sure both supply categories exist. Their slugs are what keeps them
  //    out of the shop, so they must match `lib/supplies.ts` exactly.
  const existingCategories = await db.select().from(categories)
  const categoryIdMap = new Map(existingCategories.map((c) => [c.slug, c.id]))

  for (const { slug, name } of SUPPLY_CATEGORIES) {
    if (categoryIdMap.has(slug)) continue
    const [inserted] = await db
      .insert(categories)
      .values({ id: randomUUID(), name, slug })
      .returning({ id: categories.id })
    categoryIdMap.set(slug, inserted.id)
  }
  console.log(
    `Categories ready: ${SUPPLY_CATEGORIES.map((c) => c.slug).join(', ')}`,
  )

  // 2. Upsert by SKU.
  const skus = supplies.map((s) => s.sku)
  const existing = await db
    .select({ id: products.id, sku: products.sku })
    .from(products)
    .where(inArray(products.sku, skus))
  const existingBySku = new Map(existing.map((p) => [p.sku, p.id]))

  let inserted = 0
  let updated = 0

  for (const supply of supplies) {
    const categoryId = categoryIdMap.get(supply.categorySlug)
    if (!categoryId) {
      console.warn(`Skipping ${supply.sku}: unknown category ${supply.categorySlug}`)
      continue
    }

    // Supplies are searchable by the campaign/semantic paths the same way
    // catalog products are; nothing breaks without it, so failure is soft.
    const embedding = await tryEmbed(
      [supply.name, supply.tagline, supply.description].filter(Boolean).join('. '),
    )

    const values = {
      sourceId: supply.sourceId,
      variantId: null,
      sku: supply.sku,
      name: supply.name,
      tagline: supply.tagline,
      price: String(supply.price),
      currency: supply.currency,
      stock: SUPPLY_STOCK,
      categoryId,
      image: supply.image,
      images: [supply.image],
      description: supply.description,
      details: supply.details,
      isFeatured: false,
      ...(embedding ? { embedding, embeddingUpdatedAt: new Date() } : {}),
    }

    const existingId = existingBySku.get(supply.sku)
    if (existingId) {
      await db.update(products).set(values).where(eq(products.id, existingId))
      updated++
    } else {
      await db.insert(products).values({ id: randomUUID(), ...values } as never)
      inserted++
    }
    console.log(`  ${existingId ? 'updated' : 'inserted'} ${supply.sku} — ${supply.name}`)
  }

  console.log(`Supplies: ${inserted} inserted, ${updated} updated.`)
}

seedSupplies()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Supply seed failed:', err)
    process.exit(1)
  })
