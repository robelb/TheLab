#!/usr/bin/env node
/**
 * Refresh every product's diet and sourcing badges (`labels`) without a full
 * Endeavour resync: the JTL tags already stored with each product, plus the
 * "Snacks 2026" sheet's Properties column — see scripts/lib/product-labels.ts.
 * Run it after replacing `src/data/snacks-2026.csv` with a new export.
 *
 *   pnpm sync:labels          # write
 *   pnpm sync:labels --dry    # print what would change
 */
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { products, type ProductLabel } from '../src/db/schema/index.js'
import { labelsFromTags, loadSheetLabels, mergeLabels } from './lib/product-labels.js'

const dryRun = process.argv.includes('--dry')

async function main() {
  const sheet = loadSheetLabels()
  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      labels: products.labels,
      labelsEditedAt: products.labelsEditedAt,
      sourceData: products.sourceData,
    })
    .from(products)

  let changed = 0
  const matched = new Set<string>()
  for (const row of rows) {
    const record = (row.sourceData?.product ?? null) as {
      productTags?: { productCategoryTag?: { name?: string } }[]
    } | null
    const fromSheet = sheet.bySku.get(row.sku)
    if (fromSheet) matched.add(row.sku)
    // Set by hand in the dashboard: those win.
    if (row.labelsEditedAt) continue
    const next: ProductLabel[] = mergeLabels(labelsFromTags(record?.productTags), fromSheet)
    if (next.join(',') === mergeLabels(row.labels).join(',')) continue
    changed++
    console.log(
      `  ${row.name.slice(0, 50).padEnd(50)} ${(row.labels ?? []).join(',') || '—'} → ${next.join(',') || '—'}`,
    )
    if (!dryRun) await db.update(products).set({ labels: next }).where(eq(products.id, row.id))
  }

  const unmatched = [...sheet.bySku.keys()].filter((sku) => !matched.has(sku))
  console.log(
    `\n${changed} products ${dryRun ? 'would change' : 'updated'}. ` +
      `Sheet: ${sheet.bySku.size} JFSKUs used, ${matched.size} found in the shop, ` +
      `${unmatched.length} not in the shop, ${sheet.withoutSku} rows without a JFSKU.`,
  )
  if (sheet.conflicts.length > 0) {
    console.log(
      `Skipped — the same JFSKU on rows that disagree: ${sheet.conflicts.join(', ')}`,
    )
  }
  if (dryRun) console.log('Dry run — nothing was written.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Label sync failed:', err)
    process.exit(1)
  })
