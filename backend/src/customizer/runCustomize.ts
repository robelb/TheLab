import { eq } from 'drizzle-orm'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from '../db/index.js'
import { products } from '../db/schema/index.js'
import { FEATURED_CUSTOM_PRODUCTS } from './featuredProducts.js'
import { fetchBrandImages } from './fetchBrandImages.js'
import {
  isSupabaseStorageConfigured,
  uploadToSupabase,
} from '../services/supabaseStorage.js'
import { generateCustomImage } from './generateCustomImage.js'
import type { ImageLlmConfig } from './llmImageConfig.js'
import { resolveLogoUrl } from './resolveLogoUrl.js'
import {
  customizedImagePublicUrl,
  upsertBrandCustomizations,
} from './updateCatalog.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const customizedDir = path.resolve(__dirname, '../../public/customized')

export interface RunCustomizeOptions {
  domain: string
  companyName?: string | null
  logoImageUrl?: string | null
  faviconImageUrl?: string | null
  inlineSvgLogo?: string | null
  imageLlm: ImageLlmConfig
  publicApiUrl?: string
}

export interface RunCustomizeResult {
  productId: string
  sku: string
  filePath: string
  publicUrl: string
}

export interface RunCustomizeOutcome {
  generation: number
  results: RunCustomizeResult[]
  failures: Array<{ sku: string; message: string }>
}

interface ResolvedFeaturedProduct {
  dbId: string
  sku: string
  mainImageUrl: string
}

/** Optional per-SKU image overrides (preferred print-position mockups). */
const FEATURED_IMAGE_OVERRIDES = new Map<string, string>(
  FEATURED_CUSTOM_PRODUCTS.map((p) => [p.sku, p.mainImageUrl]),
)

/**
 * All featured products to customize, sourced from the DB (`is_featured`).
 * Uses each product's catalog image, unless a pinned print-position image
 * exists for that SKU. This way every featured product gets branded — even
 * ones not in the hardcoded list.
 */
async function resolveFeaturedProducts(): Promise<ResolvedFeaturedProduct[]> {
  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      image: products.image,
    })
    .from(products)
    .where(eq(products.isFeatured, true))

  return rows
    .map((r) => ({
      dbId: r.id,
      sku: r.sku,
      mainImageUrl: FEATURED_IMAGE_OVERRIDES.get(r.sku) ?? r.image,
    }))
    .filter((p) => Boolean(p.mainImageUrl))
}

export async function runCustomize(
  options: RunCustomizeOptions,
): Promise<RunCustomizeOutcome> {
  if (
    !options.logoImageUrl &&
    !options.faviconImageUrl &&
    !options.inlineSvgLogo?.trim()
  ) {
    throw new Error(
      'runCustomize requires logoImageUrl, faviconImageUrl, and/or inlineSvgLogo.',
    )
  }

  const useSupabase = isSupabaseStorageConfigured()
  if (!useSupabase) await mkdir(customizedDir, { recursive: true })

  const generation = Date.now()
  const featuredProducts = await resolveFeaturedProducts()

  if (featuredProducts.length === 0) {
    throw new Error('No featured products found in database.')
  }

  console.error(
    `[customize] domain="${options.domain}" — generating ${featuredProducts.length} images (v=${generation})`,
  )

  const brandImages = await fetchBrandImages({
    logoImageUrl: options.logoImageUrl,
    faviconImageUrl: options.faviconImageUrl,
    inlineSvgLogo: options.inlineSvgLogo,
  })

  console.error(
    `Generating ${featuredProducts.length} customized images in parallel (${options.imageLlm.provider}) …`,
    options.companyName ? `brand: ${options.companyName}` : '',
    brandImages.logo ? 'logo: ok' : '',
    brandImages.favicon ? 'favicon: ok' : '',
  )

  // Use domain+sku for filenames so different domains don't overwrite each other
  const domainSlug = options.domain.replace(/[^a-z0-9.-]/gi, '_')

  const settled = await Promise.allSettled(
    featuredProducts.map(async (product) => {
      const png = await generateCustomImage(
        {
          productId: product.sku,
          mainImageUrl: product.mainImageUrl,
          companyName: options.companyName,
          logoImage: brandImages.logo,
          faviconImage: brandImages.favicon,
        },
        options.imageLlm,
      )

      const baseName = `${domainSlug}_${product.sku}`

      // Login-time customized images live under `custome/` in Supabase; the
      // deterministic path + upsert avoids orphans (the frontend cache-busts
      // with the generation key). Falls back to local disk when unconfigured.
      let publicUrl: string
      let filePath = ''
      if (useSupabase) {
        publicUrl = await uploadToSupabase(png, {
          contentType: 'image/png',
          path: `custome/${baseName}.png`,
          upsert: true,
        })
      } else {
        const filename = `${baseName}.png`
        filePath = path.join(customizedDir, filename)
        await writeFile(filePath, png)
        publicUrl = customizedImagePublicUrl(
          baseName,
          options.publicApiUrl,
          generation,
        )
      }

      console.error(`  → ${product.sku}: ${publicUrl}`)
      return {
        productId: product.dbId,
        sku: product.sku,
        filePath,
        publicUrl,
      }
    }),
  )

  const results: RunCustomizeResult[] = []
  const failures: Array<{ sku: string; message: string }> = []

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i]
    const sku = featuredProducts[i].sku
    if (outcome.status === 'fulfilled') {
      results.push(outcome.value)
    } else {
      const message =
        outcome.reason instanceof Error
          ? outcome.reason.message
          : String(outcome.reason)
      failures.push({ sku, message })
      console.error(`[customize] ${sku} failed:`, message)
    }
  }

  if (results.length > 0) {
    await upsertBrandCustomizations(
      options.domain,
      String(generation),
      results.map((r) => ({ productId: r.productId, imageUrl: r.publicUrl })),
    )
    console.error('Saved customizations to database')
  }

  return { generation, results, failures }
}

export { resolveLogoUrl }
