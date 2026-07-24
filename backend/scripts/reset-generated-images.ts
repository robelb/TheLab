#!/usr/bin/env node
/**
 * Reset generated-image tracking so branding starts over from scratch.
 *
 * Deletes ALL rows from `brand_customizations` (the per-company branded-image
 * overlay records — both login-generated and, going forward, saved dashboard
 * images). Image files in Supabase Storage are LEFT UNTOUCHED; this only removes
 * the DB records so nothing is tracked / overlaid anymore.
 *
 * Dry-run by default — pass --yes to actually delete.
 *
 * Usage:
 *   pnpm reset:images            # dry run: report how many rows would be deleted
 *   pnpm reset:images -- --yes   # actually delete all brand_customizations rows
 */
import { count } from 'drizzle-orm'
import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from '../src/db/index.js'
import { brandCustomizations } from '../src/db/schema/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dirname, '../.env') })

async function main() {
  const confirmed = process.argv.slice(2).includes('--yes')

  const [{ n }] = await db
    .select({ n: count() })
    .from(brandCustomizations)

  if (!confirmed) {
    console.log(
      `[dry-run] ${n} brand_customizations row(s) would be deleted.\n` +
        `Supabase image files are NOT touched. Re-run with --yes to delete.`,
    )
    return
  }

  const deleted = await db
    .delete(brandCustomizations)
    .returning({ id: brandCustomizations.id })

  console.log(
    `Deleted ${deleted.length} brand_customizations row(s). ` +
      `Supabase files left intact. Branded images will regenerate on the next ` +
      `company onboarding / brand refresh.`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Reset failed:', err)
    process.exit(1)
  })
