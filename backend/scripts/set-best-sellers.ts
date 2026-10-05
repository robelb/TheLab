#!/usr/bin/env node
/**
 * Mark products as best sellers — the ones a box is built from.
 *
 * Defaults to every SKU in src/data/normalizedProducts.json (the Midocean
 * batch). With --exclusive, every other product loses the flag, so the list
 * becomes exactly the targets.
 *
 * Usage:
 *   pnpm bestsellers                          # the whole batch
 *   pnpm bestsellers -- --skus MO6750-03,AR1804-03
 *   pnpm bestsellers -- --exclusive           # and un-flag everything else
 *   pnpm bestsellers -- --file src/data/normalizedProducts.json
 */
import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { and, eq, inArray, notInArray } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { products } from '../src/db/schema/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dirname, '../.env') })

const DEFAULT_FILE = 'src/data/normalizedProducts.json'

function parseArgs(argv: string[]) {
  let file = DEFAULT_FILE
  let skus: string[] | null = null
  let exclusive = false

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--file' && argv[i + 1]) file = argv[++i]
    else if (argv[i] === '--skus' && argv[i + 1]) {
      skus = argv[++i].split(',').map((s) => s.trim()).filter(Boolean)
    } else if (argv[i] === '--exclusive') exclusive = true
  }

  return { file, skus, exclusive }
}

async function main() {
  const { file, skus, exclusive } = parseArgs(process.argv.slice(2))

  const targets =
    skus ??
    (
      JSON.parse(
        readFileSync(path.resolve(__dirname, '..', file), 'utf8'),
      ) as Array<{ sku: string }>
    ).map((p) => p.sku)
  if (targets.length === 0) {
    console.error('No target SKUs. Provide --skus or a non-empty --file.')
    process.exit(1)
  }

  const marked = await db
    .update(products)
    .set({ isBestSeller: true })
    .where(inArray(products.sku, targets))
    .returning({ sku: products.sku, name: products.name })

  console.log(`Marked ${marked.length}/${targets.length} best sellers:`)
  for (const p of marked) console.log(`  ★ ${p.sku} — ${p.name}`)

  const notFound = targets.filter((s) => !marked.some((m) => m.sku === s))
  if (notFound.length) {
    console.log(`Not found in DB (skipped): ${notFound.join(', ')}`)
  }

  if (exclusive) {
    const cleared = await db
      .update(products)
      .set({ isBestSeller: false })
      .where(
        and(
          eq(products.isBestSeller, true),
          notInArray(products.sku, targets),
        ),
      )
      .returning({ sku: products.sku })
    console.log(`Un-flagged ${cleared.length} other product(s) (--exclusive).`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Best sellers failed:', err)
    process.exit(1)
  })
