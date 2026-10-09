/**
 * Refresh the Christmas catalogue from the live Endeavour API, in one go.
 *
 * `src/data/endeavour-product-ids.json` is the one list to edit: every product
 * we sell from Endeavour, with the "Katalogartikel" sheet row that places it
 * (null for box parts the sheet never listed). This script fetches
 * `GET /api/products/:id` for each, saves the result as
 * `endeavour-christmas.json`, and imports it into the database — prices,
 * graduated prices, every picture, labels and box contents.
 *
 *   pnpm sync:endeavour --token "<jwt>"         # fetch, save, write to the DB
 *   pnpm sync:endeavour --token "<jwt>" --dry   # fetch and preview; writes nothing
 *   pnpm sync:endeavour:fetch --token "<jwt>"   # fetch and save the file only
 *   pnpm import:endeavour                       # import the saved file only
 *
 * `--concurrency <n>` sets how many products are fetched at once (default 4).
 *
 * The API needs a short-lived bearer token: ENDEAVOUR_TOKEN (or
 * ENDEAVOUR_AUTH_HEADER) in .env, or `--token`. A product that fails to fetch
 * keeps its entry from the previous snapshot, so one bad id does not drop it
 * from the shop; one with no previous entry stops the run, and so does a
 * rejected token.
 */
import { config } from 'dotenv'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { importSnapshot, type Entry, type Snapshot } from './import-endeavour.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dirname, '../.env') })

const BASE_URL = 'https://endeavour-api-ifqbnqmhxa-ey.a.run.app/api/products'
const ID_LIST = path.join(__dirname, '../src/data/endeavour-product-ids.json')
const SNAPSHOT = path.join(__dirname, '../src/data/endeavour-christmas.json')
const DEFAULT_CONCURRENCY = 4

interface ListedProduct {
  id: string
  /** For whoever edits the list; the API's name is what gets imported. */
  name?: string
  sheet: Record<string, unknown> | null
}

type FetchedProduct = Record<string, unknown> & { id: string; name?: string }

function parseArgs(argv: string[]) {
  let token: string | undefined
  let concurrency = DEFAULT_CONCURRENCY
  const dryRun = argv.includes('--dry')
  const fetchOnly = argv.includes('--fetch-only')
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--token' && argv[i + 1]) token = argv[++i]
    else if (argv[i] === '--concurrency' && argv[i + 1]) {
      concurrency = Math.max(1, parseInt(argv[++i], 10) || DEFAULT_CONCURRENCY)
    }
  }
  return { token, concurrency, dryRun, fetchOnly }
}

function resolveAuthHeader(cliToken?: string): string {
  const token = cliToken ?? process.env.ENDEAVOUR_TOKEN?.trim()
  if (token) return `Bearer ${token.replace(/^Bearer\s+/i, '')}`
  const rawHeader = process.env.ENDEAVOUR_AUTH_HEADER?.trim()
  if (rawHeader) return rawHeader
  console.error(
    'Missing auth token. Set ENDEAVOUR_TOKEN (or ENDEAVOUR_AUTH_HEADER) in .env, ' +
      'or pass --token "<jwt>".',
  )
  process.exit(1)
}

/**
 * Each product tag carries every other product with that tag, pictures and
 * all. Nothing reads it, and it multiplies the snapshot's size.
 */
function stripRelated(product: Record<string, unknown>): void {
  const tags = product.productTags
  if (!Array.isArray(tags)) return
  for (const tag of tags as { productCategoryTag?: Record<string, unknown> }[]) {
    if (tag.productCategoryTag) delete tag.productCategoryTag.relatedProducts
  }
}

async function fetchProduct(
  id: string,
  authHeader: string,
): Promise<{ product: FetchedProduct } | { error: string }> {
  try {
    const res = await fetch(`${BASE_URL}/${id}`, {
      headers: { Authorization: authHeader, Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    })
    const text = await res.text()
    if (!res.ok) return { error: `HTTP ${res.status}: ${text.slice(0, 200)}` }
    const body = JSON.parse(text) as { product?: FetchedProduct }
    // The API wraps the record as `{ statusCode, success, product }`.
    const product = body.product ?? (body as FetchedProduct)
    if (!product?.id) return { error: 'response has no product' }
    stripRelated(product)
    return { product }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/** Run an async worker over items with a bounded concurrency pool. */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  async function run(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run))
  return results
}

async function main() {
  const { token, concurrency, dryRun, fetchOnly } = parseArgs(process.argv.slice(2))
  const authHeader = resolveAuthHeader(token)

  const listed = JSON.parse(readFileSync(ID_LIST, 'utf-8')) as ListedProduct[]
  const seen = new Set<string>()
  const ids = listed.filter((p) => !seen.has(p.id) && seen.add(p.id))
  if (ids.length < listed.length) {
    console.warn(`${listed.length - ids.length} duplicate ids in the list skipped`)
  }

  let previous = new Map<string, FetchedProduct>()
  try {
    const old = JSON.parse(readFileSync(SNAPSHOT, 'utf-8')) as {
      items: { product: FetchedProduct }[]
    }
    previous = new Map(old.items.map((e) => [e.product.id, e.product]))
  } catch {
    // First run, or an unreadable file: nothing to fall back to.
  }

  console.log(`Fetching ${ids.length} products (concurrency ${concurrency})…`)
  let done = 0
  const kept: string[] = []
  const lost: string[] = []
  let rejected = false
  const items = await mapPool(ids, concurrency, async (listedProduct) => {
    const result = await fetchProduct(listedProduct.id, authHeader)
    done++
    const label = listedProduct.name ?? listedProduct.id
    if ('product' in result) {
      console.log(`  ✓ [${done}/${ids.length}] ${result.product.name ?? label}`)
      return { sheet: listedProduct.sheet, product: result.product }
    }
    if (/^HTTP 40[13]\b/.test(result.error)) rejected = true
    const fallback = previous.get(listedProduct.id)
    console.log(`  ✗ [${done}/${ids.length}] ${label} — ${result.error}`)
    if (fallback) {
      kept.push(label)
      return { sheet: listedProduct.sheet, product: fallback }
    }
    lost.push(`${label} (${listedProduct.id})`)
    return null
  })

  // A rejected token fails every product the same way; falling back to the old
  // snapshot then would quietly re-import stale data as if it were fresh.
  if (rejected) {
    console.error(
      '\nThe API rejected the token (401/403). Get a fresh one and pass it with ' +
        '--token "<jwt>". Nothing was saved or imported.',
    )
    process.exit(1)
  }

  if (lost.length > 0) {
    console.error(
      `\n${lost.length} products could not be fetched and have no previous entry:\n  ` +
        lost.join('\n  ') +
        '\nSnapshot left unchanged.',
    )
    process.exit(1)
  }

  const snapshot: Snapshot & { source: string } = {
    source: 'endeavour-product-ids.json + GET /api/products/:id (Endeavour)',
    fetchedAt: new Date().toISOString().slice(0, 10),
    items: items as unknown as Entry[],
  }

  const all = items as { product: FetchedProduct }[]
  const tiered = all.filter(
    (e) => Array.isArray(e.product.graduatedPrices) && e.product.graduatedPrices.length > 0,
  ).length
  const multiPicture = all.filter(
    (e) => Array.isArray(e.product.pictures) && e.product.pictures.length > 1,
  ).length
  console.log(
    `\nFetched ${all.length} products: ${tiered} with graduated prices, ` +
      `${multiPicture} with more than one picture.`,
  )
  if (kept.length > 0) {
    console.warn(`${kept.length} kept from the previous snapshot: ${kept.join(', ')}`)
  }

  // A dry run leaves the saved file alone too, so it can be repeated freely.
  if (!dryRun) {
    writeFileSync(SNAPSHOT, JSON.stringify(snapshot, null, 2) + '\n')
    console.log(`Saved to ${path.relative(process.cwd(), SNAPSHOT)}.`)
  }
  if (fetchOnly) return

  console.log(`\nImporting into the database${dryRun ? ' (dry run)' : ''}…\n`)
  await importSnapshot(snapshot)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Endeavour sync failed:', err)
    process.exit(1)
  })
