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
 * replaced whole, and pictures upsert to a fixed path. Pictures that have not
 * changed since the last import are not downloaded again.
 *
 * To refresh from the live API first, run `pnpm sync:endeavour` (see
 * scripts/sync-endeavour.ts): it fetches every product and then calls
 * `importSnapshot` from here, in one go.
 *
 *   pnpm sql sql/product-source-data.sql   # once
 *   pnpm sql sql/p0-christmas.sql          # once
 *   pnpm import:endeavour                  # write
 *   pnpm import:endeavour --dry            # print what would change
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import {
  categories,
  collections,
  productComponents,
  products,
  type ComponentRole,
  type ProductLabel,
} from '../src/db/schema/index.js'
import { normalizeGraduatedPrices } from '../src/lib/pricing.js'
import { labelsFromTags, loadSheetLabels, mergeLabels } from './lib/product-labels.js'
import {
  FILLING_SLUG,
  GREETING_CARDS_SLUG,
  PACKAGING_SLUG,
  STICKERS_SLUG,
  SUPPLY_CATEGORY_SLUGS,
} from '../src/lib/supplies.js'
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

/**
 * The sheet's four groups, onto the shop's categories. "Cards & Stickers" is
 * split by name — see `categoryFor` — because the builder offers greeting
 * cards and logo stickers in separate steps.
 */
const SHEET_CATEGORIES: Record<string, { slug: string; name: string }> = {
  'Snacks & Treats': { slug: 'snacks-treats', name: 'Snacks & Treats' },
  'Gift Boxes & Bundles': { slug: 'gift-boxes', name: 'Gift Boxes & Bundles' },
  Packaging: { slug: PACKAGING_SLUG, name: 'Packaging' },
  'Cards & Stickers': { slug: GREETING_CARDS_SLUG, name: 'Greeting cards' },
}
const STICKERS_CATEGORY = { slug: STICKERS_SLUG, name: 'Logo stickers' }
const FILLING_CATEGORY = { slug: FILLING_SLUG, name: 'Filling materials' }

interface Picture {
  number: number
  url?: string
  publicUrl?: string
  filename?: string
  size?: number
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
  graduatedPrices?: { firstUnit: number; lastUnit: number; price: number }[]
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

export interface Entry {
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
    if (mapped.slug === GREETING_CARDS_SLUG && /sticker/i.test(entry.product.name)) {
      return STICKERS_CATEGORY
    }
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

/**
 * Diet and sourcing badges: the JTL tags, plus the "Snacks 2026" sheet's
 * Properties for this JFSKU — see scripts/lib/product-labels.ts.
 */
const sheetLabels = loadSheetLabels()

function labelsFor(p: SourceProduct): ProductLabel[] {
  return mergeLabels(labelsFromTags(p.productTags), sheetLabels.bySku.get(p.jfsku))
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
  if (categorySlug === GREETING_CARDS_SLUG) return 'card'
  if (categorySlug === STICKERS_SLUG) return 'sticker'
  return 'item'
}

/**
 * Each product tag carries every other product with that tag, pictures and
 * all. Nothing reads it, so it is not worth storing in `source_data`.
 */
function withoutRelated(p: SourceProduct): SourceProduct {
  return {
    ...p,
    productTags: p.productTags.map((t) => {
      const { relatedProducts: _, ...tag } = t.productCategoryTag as {
        name: string
        relatedProducts?: unknown
      }
      return { ...t, productCategoryTag: tag }
    }),
  }
}

/** What identifies a picture set, to tell whether it changed since last time. */
function pictureKey(pictures: Picture[] | undefined): string {
  return JSON.stringify(
    [...(pictures ?? [])]
      .sort((a, b) => a.number - b.number)
      .map((pic) => [pic.number, pic.publicUrl ?? pic.url, pic.size ?? null]),
  )
}

function extFor(mime: string | undefined): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

/**
 * Copy one product's pictures into our bucket, in the supplier's order — all
 * of them, so the product page has a gallery. When the supplier's pictures are
 * the ones copied last time, the stored copies are reused instead.
 */
async function storePictures(p: SourceProduct): Promise<string[]> {
  const [existing] = await db
    .select({ images: products.images, sourceData: products.sourceData })
    .from(products)
    .where(eq(products.sku, p.jfsku))
    .limit(1)
  const previous = existing?.sourceData?.originalPictures as Picture[] | undefined
  if (
    existing &&
    previous &&
    existing.images.length === p.pictures.length &&
    pictureKey(previous) === pictureKey(p.pictures)
  ) {
    return existing.images
  }

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

/**
 * Why the resync itself has a product out of sale, kept in `source_data` so a
 * later resync can tell its own hold from a decision someone made by hand:
 * - `removed` — no longer in Endeavour (or no longer in the id list);
 * - `no_price` — a shop product with no price, which would otherwise sell free.
 */
type SyncHold = 'removed' | 'no_price' | null

/**
 * Write one product, keeping what our team decided by hand.
 *
 * The source is the truth for what a product IS — name, text, pictures, its
 * own tags and labels. What the shop DOES with it is ours, and survives:
 * - a price (and so its tiers) set in the dashboard (`price_edited_at`);
 * - tags changed by hand, i.e. collection membership (`tags_edited_at`);
 * - labels set by hand (`labels_edited_at`);
 * - featured and stock, which are only ever set when the row is created;
 * - a product taken out of sale by hand stays out of sale.
 * A source price of 0 never replaces a real price already in the shop.
 */
async function upsertProduct(
  values: typeof products.$inferInsert,
  opts: { shopItem: boolean },
): Promise<{ id: string; price: number; hold: SyncHold }> {
  const [existing] = await db
    .select({
      id: products.id,
      price: products.price,
      active: products.active,
      labelsEditedAt: products.labelsEditedAt,
      priceEditedAt: products.priceEditedAt,
      tagsEditedAt: products.tagsEditedAt,
      sourceData: products.sourceData,
    })
    .from(products)
    .where(eq(products.sku, values.sku))
    .limit(1)

  const sourcePrice = Number(values.price)
  const keepPrice =
    existing && (existing.priceEditedAt || (sourcePrice === 0 && Number(existing.price) > 0))
  const price = keepPrice ? Number(existing!.price) : sourcePrice
  const hold: SyncHold = opts.shopItem && price === 0 ? 'no_price' : null
  // Out of sale by hand (no hold of ours on record) stays out of sale.
  const heldByHand = existing && !existing.active && !existing.sourceData?.syncHold
  const active = heldByHand ? false : hold === null
  const sourceData = { ...(values.sourceData ?? {}), syncHold: hold }

  if (dryRun) return { id: existing?.id ?? `dry-run:${values.sku}`, price, hold }
  if (existing) {
    const { labels, tags, graduatedPrices, isFeatured: _featured, stock: _stock, ...rest } = values
    await db
      .update(products)
      .set({
        ...rest,
        price: String(price),
        sourceData,
        active,
        ...(keepPrice ? {} : { graduatedPrices }),
        ...(existing.tagsEditedAt ? {} : { tags }),
        ...(existing.labelsEditedAt ? {} : { labels }),
      })
      .where(eq(products.id, existing.id))
    return { id: existing.id, price, hold }
  }
  const [created] = await db
    .insert(products)
    .values({ ...values, sourceData, active })
    .returning({ id: products.id })
  return { id: created.id, price, hold }
}

async function importProduct(
  entry: Entry,
  syncedAt: Date,
  extra: Partial<typeof products.$inferInsert> = {},
) {
  const p = withoutRelated(entry.product)
  const category = categoryFor(entry)
  const categoryId = await ensureCategory(category)
  const images = await storePictures(p)
  if (images.length === 0) throw new Error(`${p.name} (${p.jfsku}) has no picture`)

  const description = plainText(p.descriptionDe) || plainText(p.description)
  const graduatedPrices = normalizeGraduatedPrices(p.graduatedPrices)
  // Boxes often come with no unit price and only a volume table; the table's
  // first tier is then the price for the smallest order — and where that tier
  // starts above 1, it is also the smallest order there is a price for.
  const firstTier = graduatedPrices[0]
  const sourcePrice = round2(p.netRetailPrice.amount || firstTier?.price || 0)
  const minQuantity = Math.max(
    1,
    p.minimumOrderQuantity || 1,
    !p.netRetailPrice.amount && firstTier ? firstTier.minQty : 1,
  )
  const embedding = await tryEmbed(
    [p.name, entry.sheet?.name_en, description.slice(0, 1500)].filter(Boolean).join('. '),
  )

  const { id, price, hold } = await upsertProduct({
    sourceId: p.id,
    variantId: null,
    sku: p.jfsku,
    name: p.name,
    tagline: taglineFrom(description),
    price: String(sourcePrice),
    graduatedPrices,
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
    labels: labelsFor(p),
    minQuantity,
    sourceData: {
      provider: 'endeavour',
      sheet: entry.sheet,
      nameEn: entry.sheet?.name_en ?? null,
      originalPictures: p.pictures,
      product: p,
    },
    sourceSyncedAt: syncedAt,
    ...(embedding ? { embedding, embeddingUpdatedAt: new Date() } : {}),
    ...extra,
  }, { shopItem: !SUPPLY_CATEGORY_SLUGS.includes(category.slug) })
  return { id, category, price, hold, tiers: graduatedPrices.length }
}

export interface Snapshot {
  fetchedAt?: string
  items: Entry[]
}

/**
 * Write a snapshot into the catalogue. Reads `endeavour-christmas.json` unless
 * one is handed in — the sync script passes what it just fetched. `--dry` on
 * the command line makes it print instead of write.
 */
export async function importSnapshot(
  snapshot: Snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf-8')) as Snapshot,
): Promise<void> {
  const entries = snapshot.items
  const fetched = snapshot.fetchedAt ? new Date(snapshot.fetchedAt) : null
  const syncedAt = fetched && !Number.isNaN(fetched.getTime()) ? fetched : new Date()
  const isBox = (e: Entry) => Boolean(e.product.specifications?.isBillOfMaterials)
  const singles = entries.filter((e) => !isBox(e))
  const boxes = entries.filter(isBox)
  console.log(
    `${entries.length} products: ${singles.length} single, ${boxes.length} boxes` +
      `${dryRun ? ' (dry run)' : ''}\n`,
  )

  // Every supply category exists even when empty: the builder asks for them.
  await ensureCategory(SHEET_CATEGORIES.Packaging)
  await ensureCategory(FILLING_CATEGORY)
  await ensureCategory(SHEET_CATEGORIES['Cards & Stickers'])
  await ensureCategory(STICKERS_CATEGORY)

  // ── Singles ─────────────────────────────────────────────────────────────
  const byJfsku = new Map<
    string,
    { id: string; categorySlug: string; price: number; name: string }
  >()
  const unpriced: string[] = []
  const heldBack: string[] = []
  // One product that fails (a picture that will not download, say) is
  // reported at the end instead of stopping the import halfway through.
  const failed: string[] = []
  let tiered = 0
  for (const entry of singles) {
    try {
      const { id, category, price, hold, tiers } = await importProduct(entry, syncedAt)
      byJfsku.set(entry.product.jfsku, {
        id,
        categorySlug: category.slug,
        price,
        name: entry.product.name,
      })
      if (price === 0) unpriced.push(entry.product.name)
      if (hold) heldBack.push(entry.product.name)
      if (tiers > 0) tiered++
      console.log(
        `  single  ${entry.product.name} — €${price.toFixed(2)} [${category.slug}]` +
          (tiers > 0 ? ` (${tiers} volume tiers)` : '') +
          (hold ? '  ⚠ not for sale: no price' : ''),
      )
    } catch (err) {
      failed.push(`${entry.product.name}: ${err instanceof Error ? err.message : err}`)
      console.log(`  ✗ single  ${entry.product.name} — ${err instanceof Error ? err.message : err}`)
    }
  }

  // ── Boxes, last ─────────────────────────────────────────────────────────
  console.log('')
  const boxIds = new Map<string, string>()
  for (const entry of boxes) {
    const bom = entry.product.specifications.billOfMaterialsComponents ?? []
    const missing = bom.filter((c) => !byJfsku.has(c.jfsku))
    if (missing.length > 0) {
      // Left as it was rather than rewritten without the parts it is sold with.
      failed.push(
        `${entry.product.name}: parts not imported — ` +
          missing.map((c) => `${c.name} (${c.jfsku})`).join(', '),
      )
      console.log(`  ✗ bundle  ${entry.product.name} — parts missing, left unchanged`)
      continue
    }
    if (bom.length === 0) {
      failed.push(`${entry.product.name}: Endeavour lists no contents for this box`)
      console.log(`  ✗ bundle  ${entry.product.name} — no contents, left unchanged`)
      continue
    }

    const roleOf = (c: BomComponent) => roleFor(byJfsku.get(c.jfsku)!.categorySlug)
    const itemCount = bom.filter((c) => roleOf(c) === 'item').length
    let imported: Awaited<ReturnType<typeof importProduct>>
    try {
      imported = await importProduct(entry, syncedAt, {
        kind: 'bundle',
        tagline: `${itemCount} Produkte, weihnachtlich verpackt`,
        details: [
          ...bom.map((c) => `${c.quantity}× ${c.name}`),
          `Artikelnummer: ${entry.product.merchantSku}`,
        ],
      })
    } catch (err) {
      failed.push(`${entry.product.name}: ${err instanceof Error ? err.message : err}`)
      console.log(`  ✗ bundle  ${entry.product.name} — ${err instanceof Error ? err.message : err}`)
      continue
    }
    const { id, price, hold, tiers } = imported
    boxIds.set(entry.product.name, id)
    if (price === 0) unpriced.push(entry.product.name)
    if (hold) heldBack.push(entry.product.name)
    if (tiers > 0) tiered++

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
        role: roleOf(c),
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
  // Set up once. After that the boxes the page leads with are marketing's
  // choice in the dashboard, and a resync leaves them alone.
  const featured = FEATURED_NAMES.map((n) => boxIds.get(n)).filter(
    (id): id is string => Boolean(id),
  )
  const [landing] = await db
    .select({ featuredBundleIds: collections.featuredBundleIds })
    .from(collections)
    .where(eq(collections.slug, COLLECTION_SLUG))
    .limit(1)
  if (landing && !(landing.featuredBundleIds ?? []).length && featured.length > 0) {
    if (!dryRun) {
      await db
        .update(products)
        .set({ isFeatured: true })
        .where(inArray(products.id, featured))
      await db
        .update(collections)
        .set({ featuredBundleIds: featured })
        .where(eq(collections.slug, COLLECTION_SLUG))
    }
    console.log(`\n/c/${COLLECTION_SLUG} now features: ${FEATURED_NAMES.join(', ')}`)
  } else {
    console.log(`\n/c/${COLLECTION_SLUG}: featured boxes left as set in the dashboard`)
  }

  // ── Gone from Endeavour ─────────────────────────────────────────────────
  // Not deleted — orders and designs point at them — but taken out of sale.
  // A failed import of a product is not "gone", so it is never retired here.
  const present = entries.map((e) => e.product.jfsku)
  const gone = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(
      and(
        sql`${products.sourceData}->>'provider' = 'endeavour'`,
        notInArray(products.sku, present),
        eq(products.active, true),
      ),
    )
  if (gone.length > 0) {
    if (!dryRun) {
      await db
        .update(products)
        .set({
          active: false,
          sourceData: sql`coalesce(${products.sourceData}, '{}'::jsonb) || '{"syncHold":"removed"}'::jsonb`,
        })
        .where(inArray(products.id, gone.map((g) => g.id)))
    }
    console.log(
      `\n${gone.length} products are no longer in Endeavour and were taken out of sale: ` +
        gone.map((g) => g.name).join(', '),
    )
  }

  console.log(`\n${tiered} of ${entries.length} products have graduated prices.`)
  if (unpriced.length > 0) {
    console.log(`\n${unpriced.length} products have no price in JTL (€0): ${unpriced.join(', ')}`)
  }
  if (heldBack.length > 0) {
    console.log(
      `\n${heldBack.length} shop products are NOT FOR SALE until they have a price ` +
        `(set one in Endeavour, or in the dashboard): ${heldBack.join(', ')}`,
    )
  }
  if (failed.length > 0) {
    console.log(`\n${failed.length} could not be imported and were left as they were:`)
    for (const line of failed) console.log(`  - ${line}`)
  }
  if (dryRun) console.log('\nDry run — nothing was written.')
}

// Run on its own only when invoked directly, not when the sync script imports it.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  importSnapshot()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Endeavour import failed:', err)
      process.exit(1)
    })
}
