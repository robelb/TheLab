/**
 * Import the Christmas boxes from biglittlethings.de into the catalogue.
 *
 * The marketing site is WooCommerce, and its Store API is public, so the boxes
 * come from there rather than from scraped markup: real names, real prices,
 * real photography. What a box contains is written as an ordered list inside
 * its description, which is the one part that has to be parsed out of prose.
 *
 * Each box lands as a `bundle` product with its contents as `product_components`
 * rows. Two of them ("Neujahrsbox", "Weihnachtsbox S") are sold as surprises
 * with no fixed contents, so they land as ordinary products — a bundle with an
 * empty parts list would be a lie about what was bought.
 *
 * Idempotent: everything is matched on SKU and parts lists are replaced whole,
 * so re-running picks up whatever the marketing site says today.
 *
 *   pnpm import:christmas          # write
 *   pnpm import:christmas --dry    # print what would change
 */
import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import {
  categories,
  collections,
  productComponents,
  products,
} from '../src/db/schema/index.js'
import { embedText } from '../src/services/embedding.js'

const STORE_API =
  'https://biglittlethings.de/wp-json/wc/store/v1/products?category=285&per_page=100'

/** German VAT. The site quotes gross; this catalogue quotes net, as the
 *  configurator page does (€14.35 gross is the €12.06 net it advertises). */
const VAT_RATE = 1.19

const TAG = 'christmas'
const COLLECTION_SLUG = 'weihnachten'
const BOX_CATEGORY = { slug: 'gift-boxes', name: 'Gift boxes' }
const TREAT_CATEGORY = { slug: 'snacks-treats', name: 'Snacks & treats' }

/** The three the marketing site leads with. */
const FEATURED_SKUS = ['1783', '1784', '1799']

/** Sold as a surprise — no fixed parts list, so not a bundle. */
const SURPRISE_SKUS = new Set(['2297', '935'])

/** Free with every box, not something that is priced or swapped. */
const SKIP_ITEM = /gru[sß]karte/i

const dryRun = process.argv.includes('--dry')

interface StoreProduct {
  id: number
  name: string
  sku: string
  type: string
  permalink: string
  description: string
  short_description: string
  prices: { price: string; currency_code: string; currency_minor_unit: number }
  images: { src: string }[]
}

interface ParsedItem {
  /** The bolded part: what the thing actually is. */
  name: string
  /** The rest of the line: weight, producer, town. */
  note: string
}

interface ParsedBox {
  source: StoreProduct
  netPrice: number
  items: ParsedItem[]
}

function stripTags(html: string): string {
  return decode(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function decode(text: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    '#039': "'",
    nbsp: ' ',
    auml: 'ä',
    ouml: 'ö',
    uuml: 'ü',
    Auml: 'Ä',
    Ouml: 'Ö',
    Uuml: 'Ü',
    szlig: 'ß',
    euro: '€',
  }
  return text
    .replace(/&([a-zA-Z#0-9]+);/g, (whole, entity: string) => named[entity] ?? whole)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
}

/**
 * What is in the box.
 *
 * The contents are the first ordered list in the description, one item per
 * line, with the product itself in bold and the weight and producer after it.
 * Anything without a bold part is prose that happens to live in a list, and is
 * skipped rather than guessed at.
 */
function parseItems(description: string): ParsedItem[] {
  const list = description.match(/<ol>([\s\S]*?)<\/ol>/)
  if (!list) return []

  const items: ParsedItem[] = []
  for (const [, li] of list[1].matchAll(/<li>([\s\S]*?)<\/li>/g)) {
    const bold = [...li.matchAll(/<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)>/g)]
      .map((m) => stripTags(m[1]))
      .filter(Boolean)
    if (bold.length === 0) continue

    // "Roter Glühwein 0,25l oder alkoholfreier Punsch 0,25l" bolds both
    // alternatives; the first is what ships unless somebody asks otherwise.
    const name = bold[0].replace(/[.,;:]$/, '').trim()
    if (!name || SKIP_ITEM.test(name)) continue

    const note = stripTags(li)
      .replace(bold.join(' '), '')
      .replace(/\s+/g, ' ')
      .trim()
    items.push({ name, note })
  }
  return items
}

/** Same treat written two ways across boxes ("Bio gebrannte" / "Bio Gebrannte"). */
function treatKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[´`'’]/g, '')
    .replace(/[^a-z0-9äöüß]+/g, ' ')
    .trim()
}

function skuFor(name: string): string {
  const slug = treatKey(name)
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 34)
  return `BLT-TREAT-${slug.toUpperCase()}`
}

/**
 * A stand-in picture for a treat.
 *
 * The marketing site photographs boxes, never the things inside them, so there
 * is no real photo to point at. A tile with the name on it says what it is and
 * is obviously a placeholder — using the box's own photo for each of its six
 * contents would look like six different products that all happen to be a box.
 */
function placeholderImage(name: string): string {
  const label = name.length > 26 ? `${name.slice(0, 25)}…` : name
  const escaped = label.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><rect width="600" height="600" fill="#f4efe7"/><circle cx="300" cy="238" r="96" fill="#e2d6c5"/><text x="300" y="252" font-family="Georgia,serif" font-size="70" fill="#8a7a66" text-anchor="middle">🎁</text><text x="300" y="400" font-family="Helvetica,Arial,sans-serif" font-size="30" fill="#4a4036" text-anchor="middle">${escaped}</text><text x="300" y="442" font-family="Helvetica,Arial,sans-serif" font-size="19" fill="#9a8f80" text-anchor="middle">Foto folgt</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

async function tryEmbed(text: string): Promise<number[] | null> {
  try {
    return await embedText(text)
  } catch {
    return null
  }
}

async function ensureCategory(cat: {
  slug: string
  name: string
}): Promise<string> {
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, cat.slug))
    .limit(1)
  if (existing) return existing.id
  if (dryRun) return 'dry-run'
  const [created] = await db
    .insert(categories)
    .values({ id: randomUUID(), name: cat.name, slug: cat.slug })
    .returning({ id: categories.id })
  console.log(`Created category "${cat.name}"`)
  return created.id
}

async function upsertProduct(values: Record<string, unknown>): Promise<string> {
  const sku = values.sku as string
  const [existing] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.sku, sku))
    .limit(1)

  if (dryRun) return existing?.id ?? 'dry-run'

  if (existing) {
    await db.update(products).set(values).where(eq(products.id, existing.id))
    return existing.id
  }
  const [created] = await db
    .insert(products)
    .values({ id: randomUUID(), ...values } as never)
    .returning({ id: products.id })
  return created.id
}

async function main() {
  console.log(`Fetching the Christmas range${dryRun ? ' (dry run)' : ''}…`)
  const response = await fetch(STORE_API, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    throw new Error(`Store API answered ${response.status}`)
  }
  const source = (await response.json()) as StoreProduct[]
  console.log(`Found ${source.length} products.\n`)

  const boxes: ParsedBox[] = source.map((p) => ({
    source: p,
    netPrice:
      Math.round((Number(p.prices.price) / 100 / VAT_RATE) * 100) / 100,
    items: SURPRISE_SKUS.has(p.sku) ? [] : parseItems(p.description),
  }))

  // ── Treat prices ────────────────────────────────────────────────────────
  // The site never prices the things inside a box, only the box. So a treat is
  // valued at its share of the boxes it appears in — which keeps a customised
  // box in the right neighbourhood instead of collapsing it to nothing. These
  // are estimates and are labelled as such on the product.
  const shares = new Map<string, number[]>()
  for (const box of boxes) {
    if (box.items.length === 0) continue
    const share = box.netPrice / box.items.length
    for (const item of box.items) {
      const key = treatKey(item.name)
      shares.set(key, [...(shares.get(key) ?? []), share])
    }
  }

  const treatCategoryId = await ensureCategory(TREAT_CATEGORY)
  const boxCategoryId = await ensureCategory(BOX_CATEGORY)

  // ── The treats ──────────────────────────────────────────────────────────
  const treatIds = new Map<string, string>()
  const seenTreats = new Map<string, ParsedItem>()
  for (const box of boxes) {
    for (const item of box.items) {
      const key = treatKey(item.name)
      if (!seenTreats.has(key)) seenTreats.set(key, item)
    }
  }

  console.log(`Treats: ${seenTreats.size}`)
  for (const [key, item] of seenTreats) {
    const prices = shares.get(key) ?? []
    const price =
      Math.round(
        (prices.reduce((a, b) => a + b, 0) / Math.max(1, prices.length)) * 100,
      ) / 100
    const sku = skuFor(item.name)
    const embedding = await tryEmbed(`${item.name}. ${item.note}`)

    const id = await upsertProduct({
      sourceId: 'biglittlethings',
      variantId: null,
      sku,
      name: item.name,
      tagline: item.note.slice(0, 160),
      price: String(price),
      currency: 'EUR',
      stock: 9_999,
      categoryId: treatCategoryId,
      image: placeholderImage(item.name),
      images: [placeholderImage(item.name)],
      description: item.note || item.name,
      details: [
        item.note,
        'Preis geschätzt aus dem Boxpreis — bitte im Dashboard bestätigen.',
      ].filter(Boolean),
      isFeatured: false,
      kind: 'single',
      tags: [TAG],
      minQuantity: 1,
      ...(embedding ? { embedding, embeddingUpdatedAt: new Date() } : {}),
    })
    treatIds.set(key, id)
    console.log(`  ${item.name} — €${price.toFixed(2)} (est.)`)
  }

  // ── The boxes ───────────────────────────────────────────────────────────
  console.log('')
  const bySku = new Map<string, string>()
  for (const box of boxes) {
    const p = box.source
    const isBundle = box.items.length > 0
    const sku = `BLT-XMAS-${p.sku}`
    const gallery = p.images.map((i) => i.src)
    const embedding = await tryEmbed(
      `${p.name}. ${stripTags(p.short_description)}`,
    )

    const id = await upsertProduct({
      sourceId: 'biglittlethings',
      variantId: String(p.id),
      sku,
      name: p.name,
      tagline: isBundle
        ? `${box.items.length} Produkte, weihnachtlich verpackt`
        : 'Überraschungsbox — Inhalt wird individuell zusammengestellt',
      price: String(box.netPrice),
      currency: 'EUR',
      stock: 9_999,
      categoryId: boxCategoryId,
      image: gallery[0],
      images: gallery,
      description: stripTags(p.short_description),
      details: [
        ...box.items.map((i) => `${i.name}${i.note ? ` — ${i.note}` : ''}`),
        `Netto €${box.netPrice.toFixed(2)} · brutto €${(Number(p.prices.price) / 100).toFixed(2)}`,
        p.permalink,
      ],
      isFeatured: FEATURED_SKUS.includes(p.sku),
      kind: isBundle ? 'bundle' : 'single',
      tags: [TAG],
      minQuantity: 1,
      ...(embedding ? { embedding, embeddingUpdatedAt: new Date() } : {}),
    })
    bySku.set(p.sku, id)

    if (!dryRun) {
      await db
        .delete(productComponents)
        .where(eq(productComponents.bundleId, id))
      if (isBundle) {
        // Deliberately no packaging or filling component. These arrive in their
        // own Christmas cartonage, included in the price — attaching one of the
        // catalogue's €13 gift boxes would price the packaging above the box.
        const rows = box.items
          .map((item, i) => ({
            bundleId: id,
            componentId: treatIds.get(treatKey(item.name))!,
            quantity: 1,
            role: 'item' as const,
            sortOrder: i,
          }))
          .filter((r) => r.componentId)
        // A treat can be listed twice in one box; the table holds it once.
        const unique = [
          ...new Map(rows.map((r) => [r.componentId, r])).values(),
        ]
        if (unique.length > 0) {
          await db.insert(productComponents).values(unique)
        }
      }
    }

    const partsTotal = box.items.reduce((sum, item) => {
      const prices = shares.get(treatKey(item.name)) ?? []
      return (
        sum + prices.reduce((a, b) => a + b, 0) / Math.max(1, prices.length)
      )
    }, 0)
    console.log(
      `  ${isBundle ? 'bundle' : 'single'}  ${p.name} — €${box.netPrice.toFixed(2)} net` +
        (isBundle ? ` (parts ≈ €${partsTotal.toFixed(2)}, ${box.items.length} items)` : ''),
    )
  }

  // ── Retire the placeholder boxes the first seed made ────────────────────
  const placeholders = ['BLT-XMAS-VOL1', 'BLT-XMAS-VOL2', 'BLT-XMAS-VOL3']
  const stale = await db
    .select({ id: products.id, sku: products.sku })
    .from(products)
    .where(inArray(products.sku, placeholders))
  if (stale.length > 0 && !dryRun) {
    await db.delete(productComponents).where(
      inArray(
        productComponents.bundleId,
        stale.map((s) => s.id),
      ),
    )
    await db.delete(products).where(
      inArray(
        products.id,
        stale.map((s) => s.id),
      ),
    )
  }
  if (stale.length > 0) {
    console.log(`\nRemoved ${stale.length} placeholder boxes from the first seed.`)
  }

  // ── Point the landing page at the real boxes ────────────────────────────
  const featured = FEATURED_SKUS.map((s) => bySku.get(s)).filter(
    (id): id is string => Boolean(id),
  )
  if (!dryRun && featured.length > 0) {
    await db
      .update(collections)
      .set({ featuredBundleIds: featured })
      .where(eq(collections.slug, COLLECTION_SLUG))
  }
  console.log(
    `\n/c/${COLLECTION_SLUG} now features ${featured.length} boxes: ` +
      FEATURED_SKUS.map((s) => source.find((p) => p.sku === s)?.name).join(', '),
  )
  if (dryRun) console.log('\nDry run — nothing was written.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Christmas import failed:', err)
    process.exit(1)
  })
