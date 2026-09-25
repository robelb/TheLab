/**
 * Import the Christmas catalogue from the Endeavour (JTL) snapshot.
 *
 * `src/data/endeavour-christmas.json` pairs every row of the "Katalogartikel"
 * sheet with the full `GET /api/products/:id` record for it, plus the box
 * contents that the sheet never listed but the boxes are built from. The API
 * needs a short-lived token, so it is fetched once into that file and this
 * script only reads it.
 *
 * Order matters: single products first, boxes last. A box's contents live in
 * `specifications.billOfMaterialsComponents` (its `children` is always empty)
 * and name each part by `jfsku`, so every part has to exist before the box
 * that points at it.
 *
 * Pictures are copied into our Supabase bucket rather than hot-linked from
 * JTL, so the shop does not depend on the supplier's CDN.
 *
 * Idempotent: products match on SKU (the `jfsku`), a box's parts list is
 * replaced whole, and pictures upsert to a fixed path.
 *
 *   pnpm sql sql/product-source-data.sql   # once
 *   pnpm import:endeavour                  # write
 *   pnpm import:endeavour --dry            # print what would change
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import {
  categories,
  collections,
  productComponents,
  products,
  type ComponentRole,
} from '../src/db/schema/index.js'
import { FILLING_SLUG, PACKAGING_SLUG } from '../src/lib/supplies.js'
import { embedText } from '../src/services/embedding.js'
import { uploadToSupabase } from '../src/services/supabaseStorage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SNAPSHOT = path.join(__dirname, '../src/data/endeavour-christmas.json')

const dryRun = process.argv.includes('--dry')

/**
 * The shop disables "add to cart" at stock 0, and JTL reports 0 for every box
 * (a bill of materials has no stock of its own) and for most treats, which are
 * procured to order. So the column gets the same sentinel the other importers
 * use; the warehouse figure stays in `source_data.stock`.
 */
const SHOP_STOCK = 9_999

const COLLECTION_SLUG = 'weihnachten'

/** The boxes the landing page leads with. */
const FEATURED_NAMES = [
  'Weihnachtsbox Vol. 1 - mit Glühwein',
  'Weihnachtsbox Vol. 2 - mit Glühwein',
  'Weihnachtsbox Vol. 3',
]

/** The sheet's four groups, onto the shop's categories. */
const SHEET_CATEGORIES: Record<string, { slug: string; name: string }> = {
  'Snacks & Treats': { slug: 'snacks-treats', name: 'Snacks & Treats' },
  'Gift Boxes & Bundles': { slug: 'gift-boxes', name: 'Gift Boxes & Bundles' },
  Packaging: { slug: PACKAGING_SLUG, name: 'Packaging' },
  'Cards & Stickers': { slug: 'cards-stickers', name: 'Cards & Stickers' },
}
const FILLING_CATEGORY = { slug: FILLING_SLUG, name: 'Filling materials' }

interface Picture {
  number: number
  url?: string
  publicUrl?: string
  mimeType?: string
}

interface BomComponent {
  name: string
  jfsku: string
  quantity: number
  merchantSku?: string
}

interface SourceProduct {
  id: string
  jfsku: string
  merchantSku: string
  name: string
  description: string | null
  descriptionDe: string | null
  netRetailPrice: { amount: number; currency: string }
  minimumOrderQuantity: number
  pictures: Picture[]
  productCategories: { name: string }[]
  productTags: { productCategoryTag: { name: string } }[]
  specifications: {
    isBillOfMaterials?: boolean
    isPackaging?: boolean
    billOfMaterialsComponents?: BomComponent[]
  }
  barcode?: string | null
  originCountry?: string | null
  weight?: number | null
  [key: string]: unknown
}

interface SheetRow {
  row: number
  category: string
  name_en: string
  name_de: string
  shop_tag: string
  url: string
  note?: string
}

interface Entry {
  sheet: SheetRow | null
  product: SourceProduct
}

/** Supplier copy is Quill HTML; the shop renders plain text. */
function plainText(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<li[^>]*>/g, '\n• ')
    .replace(/<\/(p|li|ol|ul|h\d)>|<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * First sentence, short enough to sit under a product name. Short pieces are
 * joined back up so an abbreviation ("Vol. 3", "ca. 30g") does not end it.
 */
function taglineFrom(text: string): string {
  let first = ''
  for (const part of text.split('\n')[0].split(/(?<=[.!?])\s+/)) {
    first = first ? `${first} ${part}` : part
    if (first.length >= 40) break
  }
  first = first.trim()
  return first.length > 140 ? `${first.slice(0, 139)}…` : first
}

/** `care product ` → `care-product`, `wine & sparklings` → `wine-sparklings`. */
function tagSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Where a product sits. The sheet decides for anything it lists; the box parts
 * it never listed are placed by what JTL tags them as.
 */
function categoryFor(entry: Entry): { slug: string; name: string } {
  if (entry.sheet) {
    const mapped = SHEET_CATEGORIES[entry.sheet.category]
    if (!mapped) throw new Error(`Unmapped sheet category "${entry.sheet.category}"`)
    return mapped
  }
  const tags = entry.product.productTags.map((t) =>
    t.productCategoryTag.name.toLowerCase().trim(),
  )
  if (tags.includes('filling materials')) return FILLING_CATEGORY
  if (tags.includes('packaging') || entry.product.specifications.isPackaging) {
    return SHEET_CATEGORIES.Packaging
  }
  return SHEET_CATEGORIES['Snacks & Treats']
}

function tagsFor(p: SourceProduct): string[] {
  const tags = new Set(
    p.productTags.map((t) => tagSlug(t.productCategoryTag.name)).filter(Boolean),
  )
  if (p.productCategories.some((c) => c.name.toLowerCase() === 'christmas')) {
    tags.add('christmas')
  }
  return [...tags].sort()
}

/** Fact lines for the product page, from the fields that are filled. */
function detailsFor(p: SourceProduct): string[] {
  const lines: string[] = []
  if (p.weight) lines.push(`Gewicht: ${String(p.weight).replace('.', ',')} kg`)
  if (p.originCountry) lines.push(`Herkunft: ${p.originCountry}`)
  if (p.barcode) lines.push(`EAN: ${p.barcode}`)
  lines.push(`Artikelnummer: ${p.merchantSku}`)
  return lines
}

function roleFor(categorySlug: string): ComponentRole {
  if (categorySlug === PACKAGING_SLUG) return 'packaging'
  if (categorySlug === FILLING_SLUG) return 'filling'
  return 'item'
}

function extFor(mime: string | undefined): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

/** Copy one product's pictures into our bucket, in the supplier's order. */
async function storePictures(p: SourceProduct): Promise<string[]> {
  const sorted = [...p.pictures].sort((a, b) => a.number - b.number)
  const urls: string[] = []
  for (const pic of sorted) {
    const source = pic.publicUrl ?? pic.url
    if (!source) continue
    if (dryRun) {
      urls.push(source)
      continue
    }
    const res = await fetch(source, { signal: AbortSignal.timeout(60_000) })
    if (!res.ok) throw new Error(`picture ${source} answered ${res.status}`)
    const buffer = Buffer.from(await res.arrayBuffer())
    const contentType = pic.mimeType ?? res.headers.get('content-type') ?? 'image/jpeg'
    urls.push(
      await uploadToSupabase(buffer, {
        contentType,
        path: `products/endeavour/${p.jfsku}/${pic.number}.${extFor(contentType)}`,
        upsert: true,
      }),
    )
  }
  return urls
}

async function tryEmbed(text: string): Promise<number[] | null> {
  if (dryRun) return null
  try {
    return await embedText(text)
  } catch {
    return null
  }
}

const categoryIds = new Map<string, string>()

async function ensureCategory(cat: { slug: string; name: string }): Promise<string> {
  const known = categoryIds.get(cat.slug)
  if (known) return known
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, cat.slug))
    .limit(1)
  let id = existing?.id
  if (!id && dryRun) id = `dry-run:${cat.slug}`
  if (!id) {
    const [created] = await db
      .insert(categories)
      .values({ name: cat.name, slug: cat.slug })
      .returning({ id: categories.id })
    id = created.id
    console.log(`Created category "${cat.name}"`)
  }
  categoryIds.set(cat.slug, id)
  return id
}

async function upsertProduct(values: typeof products.$inferInsert): Promise<string> {
  const [existing] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.sku, values.sku))
    .limit(1)
  if (dryRun) return existing?.id ?? `dry-run:${values.sku}`
  if (existing) {
    await db.update(products).set(values).where(eq(products.id, existing.id))
    return existing.id
  }
  const [created] = await db
    .insert(products)
    .values(values)
    .returning({ id: products.id })
  return created.id
}

async function importProduct(entry: Entry, extra: Partial<typeof products.$inferInsert> = {}) {
  const p = entry.product
  const category = categoryFor(entry)
  const categoryId = await ensureCategory(category)
  const images = await storePictures(p)
  if (images.length === 0) throw new Error(`${p.name} (${p.jfsku}) has no picture`)

  const description = plainText(p.descriptionDe) || plainText(p.description)
  const price = round2(p.netRetailPrice.amount)
  const embedding = await tryEmbed(
    [p.name, entry.sheet?.name_en, description.slice(0, 1500)].filter(Boolean).join('. '),
  )

  const id = await upsertProduct({
    sourceId: p.id,
    variantId: null,
    sku: p.jfsku,
    name: p.name,
    tagline: taglineFrom(description),
    price: String(price),
    currency: p.netRetailPrice.currency || 'EUR',
    stock: SHOP_STOCK,
    categoryId,
    image: images[0],
    images,
    description,
    details: detailsFor(p),
    isFeatured: false,
    kind: 'single',
    tags: tagsFor(p),
    minQuantity: Math.max(1, p.minimumOrderQuantity || 1),
    sourceData: {
      provider: 'endeavour',
      sheet: entry.sheet,
      nameEn: entry.sheet?.name_en ?? null,
      originalPictures: p.pictures,
      product: p,
    },
    ...(embedding ? { embedding, embeddingUpdatedAt: new Date() } : {}),
    ...extra,
  })
  return { id, category, price }
}

async function main() {
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf-8')) as { items: Entry[] }
  const entries = snapshot.items
  const isBox = (e: Entry) => Boolean(e.product.specifications?.isBillOfMaterials)
  const singles = entries.filter((e) => !isBox(e))
  const boxes = entries.filter(isBox)
  console.log(
    `${entries.length} products: ${singles.length} single, ${boxes.length} boxes` +
      `${dryRun ? ' (dry run)' : ''}\n`,
  )

  // Both supply categories exist even when empty: the builder asks for them.
  await ensureCategory(SHEET_CATEGORIES.Packaging)
  await ensureCategory(FILLING_CATEGORY)

  // ── Singles ─────────────────────────────────────────────────────────────
  const byJfsku = new Map<string, { id: string; categorySlug: string; price: number }>()
  const unpriced: string[] = []
  for (const entry of singles) {
    const { id, category, price } = await importProduct(entry)
    byJfsku.set(entry.product.jfsku, { id, categorySlug: category.slug, price })
    if (price === 0) unpriced.push(entry.product.name)
    console.log(`  single  ${entry.product.name} — €${price.toFixed(2)} [${category.slug}]`)
  }

  // ── Boxes, last ─────────────────────────────────────────────────────────
  console.log('')
  const boxIds = new Map<string, string>()
  for (const entry of boxes) {
    const bom = entry.product.specifications.billOfMaterialsComponents ?? []
    const missing = bom.filter((c) => !byJfsku.has(c.jfsku))
    if (missing.length > 0) {
      throw new Error(
        `${entry.product.name}: parts not in the snapshot — ` +
          missing.map((c) => `${c.name} (${c.jfsku})`).join(', '),
      )
    }

    const itemCount = bom.filter(
      (c) => roleFor(byJfsku.get(c.jfsku)!.categorySlug) === 'item',
    ).length
    const { id, price } = await importProduct(entry, {
      kind: 'bundle',
      tagline: `${itemCount} Produkte, weihnachtlich verpackt`,
      details: [
        ...bom.map((c) => `${c.quantity}× ${c.name}`),
        `Artikelnummer: ${entry.product.merchantSku}`,
      ],
    })
    boxIds.set(entry.product.name, id)

    // One row per part: the table holds a part once, so repeats add up.
    const rows = new Map<string, typeof productComponents.$inferInsert>()
    bom.forEach((c, i) => {
      const part = byJfsku.get(c.jfsku)!
      const prior = rows.get(part.id)
      if (prior) {
        prior.quantity = (prior.quantity ?? 1) + c.quantity
        return
      }
      rows.set(part.id, {
        bundleId: id,
        componentId: part.id,
        quantity: c.quantity,
        role: roleFor(part.categorySlug),
        sortOrder: i,
      })
    })
    if (!dryRun) {
      await db.delete(productComponents).where(eq(productComponents.bundleId, id))
      await db.insert(productComponents).values([...rows.values()])
    }

    const partsTotal = bom.reduce(
      (sum, c) => sum + byJfsku.get(c.jfsku)!.price * c.quantity,
      0,
    )
    console.log(
      `  bundle  ${entry.product.name} — €${price.toFixed(2)} net ` +
        `(${itemCount} items, ${bom.length} parts, parts ≈ €${partsTotal.toFixed(2)})`,
    )
  }

  // ── Landing page ────────────────────────────────────────────────────────
  const featured = FEATURED_NAMES.map((n) => boxIds.get(n)).filter(
    (id): id is string => Boolean(id),
  )
  if (!dryRun && featured.length > 0) {
    await db
      .update(products)
      .set({ isFeatured: true })
      .where(inArray(products.id, featured))
    await db
      .update(collections)
      .set({ featuredBundleIds: featured })
      .where(eq(collections.slug, COLLECTION_SLUG))
  }
  console.log(`\n/c/${COLLECTION_SLUG} features: ${FEATURED_NAMES.join(', ')}`)

  if (unpriced.length > 0) {
    console.log(`\n${unpriced.length} products have no price in JTL (€0): ${unpriced.join(', ')}`)
  }
  if (dryRun) console.log('\nDry run — nothing was written.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Endeavour import failed:', err)
    process.exit(1)
  })
