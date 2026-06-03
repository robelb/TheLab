import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq, inArray } from 'drizzle-orm'
import { db } from './index.js'
import { categories, products } from './schema/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface RawProduct {
  id: string
  sourceId: string
  variantId: string | null
  sku: string
  name: string
  tagline: string
  price: number
  currency: string
  stock: number
  category: string
  categorySlug: string
  image: string
  customizedImage: string | null
  description: string
  details: string[]
}

const FEATURED_SKUS = new Set(['MO9518-13', 'MO9243-03'])

async function seed() {
  const catalogPath = path.join(__dirname, '../data/normalizedProducts.json')
  const rawProducts = JSON.parse(
    readFileSync(catalogPath, 'utf-8'),
  ) as RawProduct[]

  console.log(`Seeding ${rawProducts.length} products...`)

  // 1. Collect unique categories from JSON
  const categoryMap = new Map<string, string>()
  for (const p of rawProducts) {
    categoryMap.set(p.categorySlug, p.category)
  }

  // 2. Fetch all existing categories in one query
  const existingCategories = await db.select().from(categories)
  const categoryIdMap = new Map<string, string>(
    existingCategories.map((c) => [c.slug, c.id]),
  )

  // 3. Insert missing categories in one batch
  const newCategories = [...categoryMap.entries()]
    .filter(([slug]) => !categoryIdMap.has(slug))
    .map(([slug, name]) => ({ id: randomUUID(), name, slug }))

  if (newCategories.length > 0) {
    const inserted = await db
      .insert(categories)
      .values(newCategories)
      .returning({ id: categories.id, slug: categories.slug })

    for (const c of inserted) {
      categoryIdMap.set(c.slug, c.id)
    }
  }

  console.log(
    `Categories: ${newCategories.length} new, ${existingCategories.length} existing`,
  )

  // 4. Fetch all existing product SKUs in one query
  const allSkus = rawProducts.map((p) => p.sku)
  const existingProducts = await db
    .select({ id: products.id, sku: products.sku })
    .from(products)
    .where(inArray(products.sku, allSkus))

  const existingSkuMap = new Map(existingProducts.map((p) => [p.sku, p.id]))

  // 5. Split into inserts and updates
  const toInsert: Array<Record<string, unknown>> = []
  const toUpdate: Array<{ id: string; values: Record<string, unknown> }> = []

  for (const p of rawProducts) {
    const categoryId = categoryIdMap.get(p.categorySlug)
    if (!categoryId) {
      console.warn(`Skipping ${p.sku}: unknown category ${p.categorySlug}`)
      continue
    }

    const values = {
      sourceId: p.sourceId,
      variantId: p.variantId,
      sku: p.sku,
      name: p.name,
      tagline: p.tagline,
      price: String(p.price),
      currency: p.currency,
      stock: p.stock,
      categoryId,
      image: p.image,
      customizedImage: p.customizedImage,
      description: p.description,
      details: p.details,
      isFeatured: FEATURED_SKUS.has(p.sku),
    }

    const existingId = existingSkuMap.get(p.sku)
    if (existingId) {
      toUpdate.push({ id: existingId, values })
    } else {
      toInsert.push({ id: randomUUID(), ...values })
    }
  }

  // 6. Batch insert new products
  if (toInsert.length > 0) {
    await db.insert(products).values(toInsert as never)
  }

  // 7. Update existing products (sequential but only for changed rows)
  for (const { id, values } of toUpdate) {
    await db.update(products).set(values).where(eq(products.id, id))
  }

  console.log(`Products: ${toInsert.length} inserted, ${toUpdate.length} updated`)
  console.log('Seed complete.')
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
