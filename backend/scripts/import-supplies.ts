/**
 * Pull box / filling-material records from the Endeavour catalogue API and
 * merge them into `src/data/supplies.json`. Run `db:seed:supplies` afterwards
 * to push them to the database.
 *
 *   ENDEAVOUR_TOKEN=<jwt> pnpm import:supplies <id> [<id> ...]
 *   ENDEAVOUR_TOKEN=<jwt> pnpm import:supplies --file ids.txt
 *
 * Options:
 *   --box-price=keep|lowest|first   How to price a box, which the API returns
 *                                   with netRetailPrice 0 and a graduated
 *                                   volume table instead. Default `keep`:
 *                                   leave an existing price alone and report
 *                                   any new box as needing one.
 *
 * Records are keyed on `jfsku`, NOT on name — supplier names get rewritten
 * (`Magnet Box` became `Magnetbox - weiß - 35x25x10cm`), so matching on name
 * would import the same product twice under two rows.
 *
 * The token is read from the environment and never written to disk.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FILLING_SLUG, PACKAGING_SLUG } from '../src/lib/supplies.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SUPPLIES_PATH = path.join(__dirname, '../src/data/supplies.json')

const API_BASE =
  process.env.ENDEAVOUR_API_BASE ??
  'https://endeavour-api-ifqbnqmhxa-ey.a.run.app'

interface Supply {
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

interface CataloguePicture {
  publicUrl?: string
  url?: string
}

interface CatalogueProduct {
  id: string
  jfsku: string
  name: string
  description?: string | null
  merchantSku?: string
  netRetailPrice?: { amount: number; currency: string }
  graduatedPrices?: { firstUnit: number; lastUnit: number; price: number }[]
  pictures?: CataloguePicture[]
  productTags?: { productCategoryTag?: { name?: string } }[]
}

type BoxPriceMode = 'keep' | 'lowest' | 'first'

/** The tag decides the group — every one of these sits under `packaging`. */
function categorySlugFor(product: CatalogueProduct): string | null {
  const tags = (product.productTags ?? [])
    .map((t) => t.productCategoryTag?.name?.toLowerCase())
    .filter(Boolean) as string[]
  if (tags.includes('boxes')) return PACKAGING_SLUG
  if (tags.includes('filling materials')) return FILLING_SLUG
  return null
}

/** Supplier copy arrives with HTML and CRLF in it; the UI renders plain text. */
function plainText(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function resolvePrice(
  product: CatalogueProduct,
  existing: Supply | undefined,
  mode: BoxPriceMode,
): { price: number; note?: string } | null {
  const unit = product.netRetailPrice?.amount ?? 0
  if (unit > 0) return { price: Math.round(unit * 100) / 100 }

  // Boxes come back with no unit price and a volume table instead.
  const tiers = product.graduatedPrices ?? []
  if (tiers.length === 0) {
    return existing
      ? { price: existing.price, note: 'no price from API — kept existing' }
      : null
  }

  const sorted = [...tiers].sort((a, b) => a.firstUnit - b.firstUnit)
  if (mode === 'first') {
    return {
      price: sorted[0].price,
      note: `graduated tier ${sorted[0].firstUnit}+ (€${sorted[0].price})`,
    }
  }
  if (mode === 'lowest') {
    const cheapest = sorted.reduce((a, b) => (b.price < a.price ? b : a))
    return {
      price: cheapest.price,
      note: `cheapest tier ${cheapest.firstUnit}+ (€${cheapest.price})`,
    }
  }
  return existing
    ? { price: existing.price, note: 'graduated pricing — kept existing' }
    : null
}

async function fetchProduct(id: string, token: string) {
  const res = await fetch(`${API_BASE}/api/products/${id}/catalogue`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${await res.text().catch(() => '')}`)
  }
  const body = (await res.json()) as { product?: CatalogueProduct }
  if (!body.product) throw new Error('response had no `product`')
  return body.product
}

async function main() {
  const token = process.env.ENDEAVOUR_TOKEN
  if (!token) {
    console.error('ENDEAVOUR_TOKEN is required (a bearer JWT for the catalogue API).')
    process.exit(1)
  }

  const args = process.argv.slice(2)
  let boxPrice: BoxPriceMode = 'keep'
  const ids: string[] = []

  for (const arg of args) {
    if (arg.startsWith('--box-price=')) {
      const mode = arg.split('=')[1] as BoxPriceMode
      if (!['keep', 'lowest', 'first'].includes(mode)) {
        console.error(`Unknown --box-price=${mode} (keep|lowest|first)`)
        process.exit(1)
      }
      boxPrice = mode
    } else if (arg.startsWith('--file=')) {
      ids.push(
        ...readFileSync(arg.split('=')[1], 'utf-8')
          .split('\n')
          .map((l) => l.trim().replace(/^-\s*/, ''))
          .filter((l) => l && !l.startsWith('#')),
      )
    } else {
      ids.push(arg)
    }
  }

  if (ids.length === 0) {
    console.error('Pass at least one product id, or --file=ids.txt')
    process.exit(1)
  }

  const existing = JSON.parse(readFileSync(SUPPLIES_PATH, 'utf-8')) as Supply[]
  const bySku = new Map(existing.map((s) => [s.sku, s]))
  const byName = new Map(existing.map((s) => [s.name.toLowerCase(), s]))

  let added = 0
  let updated = 0
  const blocked: string[] = []

  for (const id of ids) {
    let product: CatalogueProduct
    try {
      product = await fetchProduct(id, token)
    } catch (err) {
      console.log(`  FAIL     ${id}: ${err instanceof Error ? err.message : err}`)
      continue
    }

    const categorySlug = categorySlugFor(product)
    if (!categorySlug) {
      console.log(`  SKIP     ${product.name} — not tagged boxes/filling materials`)
      continue
    }

    const prior = bySku.get(product.jfsku)

    // A name that already belongs to a DIFFERENT sku is a real duplicate.
    const nameClash = byName.get(product.name.toLowerCase())
    if (!prior && nameClash) {
      console.log(
        `  SKIP     ${product.name} — same name already imported as ${nameClash.sku}`,
      )
      continue
    }

    const resolved = resolvePrice(product, prior, boxPrice)
    if (!resolved) {
      blocked.push(product.name)
      console.log(
        `  BLOCKED  ${product.name} — API price is 0 and it has ${
          product.graduatedPrices?.length ?? 0
        } volume tiers; no unit price to use`,
      )
      continue
    }

    const image =
      product.pictures?.[0]?.publicUrl ?? product.pictures?.[0]?.url ?? ''
    if (!image) {
      console.log(`  SKIP     ${product.name} — no picture`)
      continue
    }

    const record: Supply = {
      sourceId: product.id,
      sku: product.jfsku,
      merchantSku: product.merchantSku ?? '',
      name: product.name,
      // The API has no tagline/details; keep whatever was written by hand.
      tagline: prior?.tagline ?? '',
      price: resolved.price,
      currency: product.netRetailPrice?.currency ?? 'EUR',
      categorySlug,
      image,
      description: plainText(product.description),
      details: prior?.details ?? [],
    }

    if (prior) {
      const renamedFrom = prior.name !== record.name ? prior.name : null
      Object.assign(prior, record)
      updated++
      console.log(
        `  UPDATE   ${product.name} (${product.jfsku})` +
          (renamedFrom ? ` — renamed from "${renamedFrom}"` : '') +
          (resolved.note ? ` — ${resolved.note}` : ''),
      )
    } else {
      existing.push(record)
      bySku.set(record.sku, record)
      byName.set(record.name.toLowerCase(), record)
      added++
      console.log(
        `  ADD      ${product.name} (${product.jfsku}) €${record.price} [${categorySlug}]`,
      )
    }
  }

  existing.sort(
    (a, b) =>
      a.categorySlug.localeCompare(b.categorySlug) || a.price - b.price ||
      a.name.localeCompare(b.name),
  )
  writeFileSync(SUPPLIES_PATH, `${JSON.stringify(existing, null, 2)}\n`)

  console.log(
    `\n${added} added, ${updated} updated, ${blocked.length} blocked. supplies.json now has ${existing.length} records.`,
  )
  if (blocked.length > 0) {
    console.log(
      `Blocked (need a unit price): ${blocked.join(', ')}\n` +
        `Re-run with --box-price=lowest or --box-price=first to take one from the volume table.`,
    )
  }
  console.log('Run `pnpm db:seed:supplies` to push this to the database.')
}

main().catch((err) => {
  console.error('Import failed:', err)
  process.exit(1)
})
