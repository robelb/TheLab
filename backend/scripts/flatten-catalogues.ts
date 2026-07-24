#!/usr/bin/env node
/**
 * Flatten the raw Endeavour catalogue envelope into a clean, products-only JSON
 * array — the exact shape normalize_products.py expects (like realProducts.json).
 *
 * Strips all envelope metadata (fetchedAt, counts, per-id status) and unwraps each
 * catalogue response ({ statusCode, success, product }) down to its `product` object.
 *
 * Usage:
 *   pnpm flatten:catalogues
 *   pnpm flatten:catalogues -- --in src/data/endeavour-catalogues.raw.json --out src/data/endeavour-products.flat.json
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile } from 'node:fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DEFAULT_IN = 'src/data/endeavour-catalogues.raw.json'
const DEFAULT_OUT = 'src/data/endeavour-products.flat.json'

interface RawResult {
  id: string
  ok: boolean
  data: unknown
  error: string | null
}

interface RawEnvelope {
  results: RawResult[]
}

function parseArgs(argv: string[]) {
  let inPath = DEFAULT_IN
  let outPath = DEFAULT_OUT
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--in' && argv[i + 1]) inPath = argv[++i]
    else if (argv[i] === '--out' && argv[i + 1]) outPath = argv[++i]
  }
  return { inPath, outPath }
}

/** Pull the product object out of one catalogue response body. */
function extractProduct(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>

  // Observed shape: { statusCode, success, product: {...} }
  if (obj.product && typeof obj.product === 'object') {
    return obj.product as Record<string, unknown>
  }
  // Fallbacks in case the API nests differently: { data: { product } } or a bare product.
  if (obj.data && typeof obj.data === 'object') {
    return extractProduct(obj.data)
  }
  if ('variants' in obj || 'jfsku' in obj || 'merchantSku' in obj) {
    return obj
  }
  return null
}

async function main() {
  const { inPath, outPath } = parseArgs(process.argv.slice(2))

  const raw = JSON.parse(
    await readFile(path.resolve(__dirname, '..', inPath), 'utf8'),
  ) as RawEnvelope

  if (!Array.isArray(raw.results)) {
    console.error(`Expected a "results" array in ${inPath}. Is this the raw fetch envelope?`)
    process.exit(1)
  }

  const products: Record<string, unknown>[] = []
  const seen = new Set<string>()
  const missing: string[] = []

  for (const r of raw.results) {
    if (!r.ok) continue
    const product = extractProduct(r.data)
    if (!product) {
      missing.push(r.id)
      continue
    }
    const key = String(product.id ?? product.merchantSku ?? r.id)
    if (seen.has(key)) continue
    seen.add(key)
    products.push(product)
  }

  const resolved = path.resolve(__dirname, '..', outPath)
  await writeFile(resolved, JSON.stringify(products, null, 2) + '\n', 'utf8')

  console.log(`Flattened ${products.length} products → ${outPath}`)
  if (missing.length) {
    console.log(`No product found in ${missing.length} response(s): ${missing.join(', ')}`)
  }
}

main().catch((err) => {
  console.error('Flatten failed:', err)
  process.exit(1)
})
