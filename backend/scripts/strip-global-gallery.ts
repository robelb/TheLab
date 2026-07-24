#!/usr/bin/env node
/**
 * Strip AI-generated images that leaked into the GLOBAL product gallery
 * (`products.images`) back before dashboard images became company-scoped.
 *
 * Those images are visible to every visitor regardless of company — the leak.
 * This keeps only base catalog images (and each product's own cover) and drops
 * generated ones (Supabase-hosted / uploaded / customized paths). Supabase files
 * are NOT deleted; only the DB references in products.images are removed.
 *
 * Dry-run by default — pass --yes to apply.
 *
 * Usage:
 *   pnpm strip:gallery            # report what would change
 *   pnpm strip:gallery -- --yes   # apply
 */
import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { products } from '../src/db/schema/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dirname, '../.env') })

/** A generated (non-catalog) image URL: Supabase storage, or an upload/customized path. */
function isGenerated(url: string): boolean {
  return (
    /supabase\.co\/storage/i.test(url) ||
    /\/api\/customized\//i.test(url) ||
    /\/api\/uploads?\//i.test(url) ||
    /\/uploads?\//i.test(url)
  )
}

async function main() {
  const confirmed = process.argv.slice(2).includes('--yes')

  const rows = await db
    .select({ id: products.id, sku: products.sku, image: products.image, images: products.images })
    .from(products)

  const changes: Array<{ id: string; sku: string; before: number; after: number; kept: string[] }> = []

  for (const p of rows) {
    const images = p.images ?? []
    if (images.length === 0) continue
    // Keep each product's own cover plus any non-generated (base catalog) image.
    const kept = images.filter((u) => u === p.image || !isGenerated(u))
    if (kept.length !== images.length) {
      changes.push({ id: p.id, sku: p.sku, before: images.length, after: kept.length, kept })
    }
  }

  if (changes.length === 0) {
    console.log('No products have generated images in the global gallery. Nothing to strip.')
    return
  }

  const removed = changes.reduce((n, c) => n + (c.before - c.after), 0)
  console.log(
    `${confirmed ? 'Stripping' : '[dry-run] Would strip'} ${removed} generated image(s) ` +
      `from ${changes.length} product(s):`,
  )
  for (const c of changes) {
    console.log(`  ${c.sku}: ${c.before} → ${c.after} image(s)`)
  }

  if (!confirmed) {
    console.log('\nSupabase files are NOT touched. Re-run with --yes to apply.')
    return
  }

  for (const c of changes) {
    await db.update(products).set({ images: c.kept }).where(eq(products.id, c.id))
  }
  console.log(`\nDone. Updated ${changes.length} product(s). Supabase files left intact.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Strip failed:', err)
    process.exit(1)
  })
