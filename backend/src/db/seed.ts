import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
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

  // Extract unique categories
  const categoryMap = new Map<string, string>()
  for (const p of rawProducts) {
    categoryMap.set(p.categorySlug, p.category)
  }

  // Upsert categories
  const categoryIdMap = new Map<string, string>()

  for (const [slug, name] of categoryMap) {
    const existing = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, slug))
      .limit(1)

    if (existing.length > 0) {
      categoryIdMap.set(slug, existing[0].id)
    } else {
      const [inserted] = await db
        .insert(categories)
        .values({ id: randomUUID(), name, slug })
        .returning({ id: categories.id })
      categoryIdMap.set(slug, inserted.id)
    }
  }

  console.log(`Seeded ${categoryIdMap.size} categories`)

  // Upsert products (match by SKU since IDs are now UUIDs)
  let inserted = 0
  let updated = 0

  for (const p of rawProducts) {
    const categoryId = categoryIdMap.get(p.categorySlug)
    if (!categoryId) {
      console.warn(`Skipping product ${p.sku}: unknown category ${p.categorySlug}`)
      continue
    }

    const existing = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.sku, p.sku))
      .limit(1)

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

    if (existing.length > 0) {
      await db.update(products).set(values).where(eq(products.id, existing[0].id))
      updated++
    } else {
      await db.insert(products).values({ id: randomUUID(), ...values })
      inserted++
    }
  }

  console.log(`Products: ${inserted} inserted, ${updated} updated`)
  console.log('Seed complete.')
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
