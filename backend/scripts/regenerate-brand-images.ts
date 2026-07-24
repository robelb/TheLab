#!/usr/bin/env node
/**
 * Force-regenerate the per-company branded featured-product images.
 *
 * Uses each company's ALREADY-STORED brand extraction (logo/favicon/theme) — it
 * does NOT re-extract the theme — and re-runs image generation, repopulating
 * `brand_customizations` for that company. Resets `images_status` around the run
 * exactly like onboarding (pending → ready/failed/skipped).
 *
 * Only companies with `brand_status = 'ready'` AND a stored brand can regenerate.
 * (Companies whose extraction failed have no brand to generate from.)
 *
 * Dry-run by default — pass --yes to actually generate (this costs AI image calls).
 *
 * Usage:
 *   pnpm regenerate:images                       # dry run: list targets + est. calls
 *   pnpm regenerate:images -- --yes              # regenerate for ALL ready companies
 *   pnpm regenerate:images -- --company apple.com --yes
 */
import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { and, count, eq, isNotNull } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { companies, products } from '../src/db/schema/index.js'
import { customizeFeaturedImages } from '../src/customizer/analyzeWithCustomization.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dirname, '../.env') })

function parseArgs(argv: string[]) {
  let confirmed = false
  let company: string | undefined
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--yes') confirmed = true
    else if (argv[i] === '--company' && argv[i + 1]) company = argv[++i]
  }
  return { confirmed, company }
}

async function main() {
  const { confirmed, company } = parseArgs(process.argv.slice(2))

  const ready = await db
    .select()
    .from(companies)
    .where(and(eq(companies.brandStatus, 'ready'), isNotNull(companies.brand)))

  const targets = company
    ? ready.filter((c) => c.id === company || c.domain === company)
    : ready

  const [{ n: featuredCount }] = await db
    .select({ n: count() })
    .from(products)
    .where(eq(products.isFeatured, true))

  if (targets.length === 0) {
    console.log(
      company
        ? `No regenerable company matches "${company}" (needs brand_status=ready + a stored brand).`
        : 'No companies with a ready brand to regenerate.',
    )
    return
  }

  console.log(
    `${confirmed ? 'Regenerating' : '[dry-run] Would regenerate'} branded images for ` +
      `${targets.length} company(ies) × ${featuredCount} featured products ` +
      `(~${targets.length * featuredCount} image-gen calls):`,
  )
  for (const c of targets) console.log(`  - ${c.name} (${c.domain})`)

  if (!confirmed) {
    console.log('\nRe-run with --yes to generate. This makes real AI image calls.')
    return
  }

  for (const c of targets) {
    console.log(`\n[${c.domain}] regenerating…`)
    await db
      .update(companies)
      .set({ imagesStatus: 'pending', imagesError: null })
      .where(eq(companies.id, c.id))

    const result = await customizeFeaturedImages(c.brand!, c.id, c.domain)

    await db
      .update(companies)
      .set({
        imagesStatus: result.status,
        imagesError: result.status === 'ready' ? null : (result.message ?? null),
        ...(result.generation
          ? { brandGeneration: String(result.generation) }
          : {}),
      })
      .where(eq(companies.id, c.id))

    const made = result.customizedProducts?.length ?? 0
    console.log(
      `[${c.domain}] → status=${result.status}, images=${made}` +
        (result.message ? `, note: ${result.message}` : ''),
    )
  }

  console.log('\nDone.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Regeneration failed:', err)
    process.exit(1)
  })
