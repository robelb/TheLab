#!/usr/bin/env node
/**
 * Mark a slice of the freshly-seeded batch as featured products.
 *
 * Defaults to the first 10 SKUs in src/data/normalizedProducts.json (the current
 * batch) and flips is_featured -> true. Non-destructive by default: other products'
 * featured flags are left untouched unless you pass --exclusive.
 *
 * Usage:
 *   pnpm feature                          # feature the first 10 of the batch
 *   pnpm feature -- --count 5             # feature the first 5
 *   pnpm feature -- --skus MO6750-03,AR1804-03
 *   pnpm feature -- --exclusive           # also un-feature the rest of the batch
 *   pnpm feature -- --file src/data/normalizedProducts.json
 */
import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { inArray } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { products } from '../src/db/schema/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dirname, '../.env') })

const DEFAULT_FILE = 'src/data/normalizedProducts.json'
const DEFAULT_COUNT = 10

interface Args {
  file: string
  count: number
  skus: string[] | null
  exclusive: boolean
}

function parseArgs(argv: string[]): Args {
  let file = DEFAULT_FILE
  let count = DEFAULT_COUNT
  let skus: string[] | null = null
  let exclusive = false

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--file' && argv[i + 1]) file = argv[++i]
    else if (argv[i] === '--count' && argv[i + 1]) {
      count = Math.max(0, parseInt(argv[++i], 10) || DEFAULT_COUNT)
    } else if (argv[i] === '--skus' && argv[i + 1]) {
      skus = argv[++i].split(',').map((s) => s.trim()).filter(Boolean)
    } else if (argv[i] === '--exclusive') exclusive = true
  }

  return { file, count, skus, exclusive }
}

async function main() {
  const { file, count, skus, exclusive } = parseArgs(process.argv.slice(2))

  const batch = JSON.parse(
    readFileSync(path.resolve(__dirname, '..', file), 'utf8'),
  ) as Array<{ sku: string; name: string }>
  const batchSkus = batch.map((p) => p.sku)

  const targets = skus ?? batchSkus.slice(0, count)
  if (targets.length === 0) {
    console.error('No target SKUs. Provide --skus or a non-zero --count.')
    process.exit(1)
  }

  const featured = await db
    .update(products)
    .set({ isFeatured: true })
    .where(inArray(products.sku, targets))
    .returning({ sku: products.sku, name: products.name })

  console.log(`Featured ${featured.length}/${targets.length} products:`)
  for (const p of featured) console.log(`  ★ ${p.sku} — ${p.name}`)

  const notFound = targets.filter((s) => !featured.some((f) => f.sku === s))
  if (notFound.length) {
    console.log(`Not found in DB (skipped): ${notFound.join(', ')}`)
  }

  if (exclusive) {
    const rest = batchSkus.filter((s) => !targets.includes(s))
    if (rest.length) {
      const cleared = await db
        .update(products)
        .set({ isFeatured: false })
        .where(inArray(products.sku, rest))
        .returning({ sku: products.sku })
      console.log(
        `Un-featured ${cleared.length} other batch product(s) (--exclusive).`,
      )
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Feature failed:', err)
    process.exit(1)
  })
