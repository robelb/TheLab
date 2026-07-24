#!/usr/bin/env node
/**
 * Fetch product catalogues from the Endeavour API for a fixed list of product IDs
 * and save the raw responses to a JSON file for later normalization + push.
 *
 * The endpoint requires a bearer token. Provide it via one of:
 *   - ENDEAVOUR_TOKEN in .env            (sent as "Authorization: Bearer <token>")
 *   - ENDEAVOUR_AUTH_HEADER in .env      (sent verbatim as the Authorization header)
 *   - --token "<jwt>" CLI flag           (overrides the env token)
 *
 * Usage:
 *   pnpm fetch:catalogues
 *   pnpm fetch:catalogues -- --token "<jwt>"
 *   pnpm fetch:catalogues -- --out src/data/endeavour-catalogues.raw.json --concurrency 4
 */
import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFile, mkdir } from 'node:fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dirname, '../.env') })

const BASE_URL =
  'https://endeavour-api-ifqbnqmhxa-ey.a.run.app/api/products'

const catalogueUrl = (id: string) => `${BASE_URL}/${id}/catalogue`

/**
 * Product IDs to fetch — copied verbatim from the source list (duplicates and all;
 * dedup happens at runtime). Two entries were flagged in the source with "?" and
 * "see comment"; kept as-is until clarified.
 */
const PRODUCT_IDS: string[] = [
  '019ca18b-a854-73df-ad58-f7acbc0ba529',
  '019ca18b-a887-750c-9efe-d9986e23680e',
  '019ca18b-a796-761d-adf2-8012d4873031',
  '019ca18b-a89e-747e-9f50-606a209766de',
  '019ca18b-a89d-7397-9d2c-304c2af89380',
  '6e03f82d-94c4-4b8e-9b34-fb7958cd89b3',
  '0a64baa7-1513-4cc2-a2d3-8ae7afd556d7',
  '019ca18b-a853-72ce-a68e-dbbb3febcd47',
  '019ca18b-a867-72b1-90b1-87bdb9f88ea4',
  '019ca18b-a84b-750c-b2cd-d2109e6be815', // flagged "?"
  '019ca18b-a837-75fa-9e74-e812494007c5',
  '019ca18b-a845-7009-9d47-2c02af4c0bf2',
  '019ca18b-a84c-75c8-a5c1-be26d1deffc4',
  '019ca18b-a7dd-7018-a58f-8d7a46fe26f4',
  '0dc57184-a80f-490a-93ae-e6edada9c857',
  '019ca18b-a7da-70cb-8839-281de80875ac',
  '019ca18b-a83d-752c-a263-0dff45b31db9',
  '019ca18b-a867-72b1-90b1-87bdb9f88ea4', // duplicate of an earlier id
  '019ca18b-a883-71b0-bcd4-5efdf16b549d',
  '019ca18b-a87f-704c-87e2-c54ace9bd38e',
  '019ca18b-a875-732f-8967-9578db239eef',
  '019ca18b-a895-70cb-8265-ed706bfed5a8',
  '019ca18b-a83b-763c-9bad-43599f827360',
  '019ca18b-a7a9-73cd-923d-c39e5537acd2',
  '019ca18b-a86c-721f-abf1-2a448a7ac3c4',
  '019ca18b-a83f-722b-8e89-336500528e0d',
  '019ca18b-a84c-75c8-a5c2-6321b1ccafd9',
  '019ca18b-a83c-744c-a64a-7c694581f084',
  '019ca18b-a89d-7397-9d2d-a115d1c1561b', // flagged "see comment"
  'ff16e593-ea9a-43d7-aaf1-a9e8569309f8',
  '23d5dcc1-38ac-4b8b-ac9d-3588d776984c',
]

const DEFAULT_OUT = 'src/data/endeavour-catalogues.raw.json'
const DEFAULT_CONCURRENCY = 4

interface CliArgs {
  token?: string
  out: string
  concurrency: number
}

function parseArgs(argv: string[]): CliArgs {
  let token: string | undefined
  let out = DEFAULT_OUT
  let concurrency = DEFAULT_CONCURRENCY

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--token' && argv[i + 1]) token = argv[++i]
    else if (argv[i] === '--out' && argv[i + 1]) out = argv[++i]
    else if (argv[i] === '--concurrency' && argv[i + 1]) {
      concurrency = Math.max(1, parseInt(argv[++i], 10) || DEFAULT_CONCURRENCY)
    }
  }

  return { token, out, concurrency }
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

interface FetchResult {
  id: string
  url: string
  ok: boolean
  status: number | null
  data: unknown
  error: string | null
}

async function fetchCatalogue(
  id: string,
  authHeader: string,
): Promise<FetchResult> {
  const url = catalogueUrl(id)
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
      },
    })

    let body: unknown = null
    const text = await res.text()
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = text // non-JSON response — keep raw text
    }

    return {
      id,
      url,
      ok: res.ok,
      status: res.status,
      data: res.ok ? body : null,
      error: res.ok ? null : `HTTP ${res.status}: ${text.slice(0, 300)}`,
    }
  } catch (err) {
    return {
      id,
      url,
      ok: false,
      status: null,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Run an async worker over items with a bounded concurrency pool. */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0

  async function run(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, run),
  )
  return results
}

async function main() {
  const { token, out, concurrency } = parseArgs(process.argv.slice(2))
  const authHeader = resolveAuthHeader(token)

  const uniqueIds = [...new Set(PRODUCT_IDS)]
  const dupes = PRODUCT_IDS.length - uniqueIds.length
  console.log(
    `Fetching ${uniqueIds.length} catalogues (${dupes} duplicate id${
      dupes === 1 ? '' : 's'
    } skipped, concurrency ${concurrency})...`,
  )

  let done = 0
  const results = await mapPool(uniqueIds, concurrency, async (id) => {
    const result = await fetchCatalogue(id, authHeader)
    done++
    const mark = result.ok ? '✓' : '✗'
    console.log(
      `  ${mark} [${done}/${uniqueIds.length}] ${id} ${
        result.ok ? '' : `— ${result.error}`
      }`,
    )
    return result
  })

  const okCount = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)

  const envelope = {
    fetchedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    requested: PRODUCT_IDS.length,
    unique: uniqueIds.length,
    ok: okCount,
    failed: failed.length,
    results,
  }

  const outPath = path.resolve(__dirname, '..', out)
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, JSON.stringify(envelope, null, 2), 'utf8')

  console.log(`\nSaved ${okCount}/${uniqueIds.length} catalogues → ${out}`)
  if (failed.length) {
    console.log(`${failed.length} failed:`)
    for (const f of failed) console.log(`  - ${f.id}: ${f.error}`)
  }
}

main().catch((err) => {
  console.error('Fetch failed:', err)
  process.exit(1)
})
