import { eq } from 'drizzle-orm'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from '../db/index.js'
import { products } from '../db/schema/index.js'
import { FEATURED_CUSTOM_PRODUCTS } from './featuredProducts.js'
import { fetchBrandImages } from './fetchBrandImages.js'
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

async function resolveFeaturedProducts(): Promise<ResolvedFeaturedProduct[]> {
  const resolved: ResolvedFeaturedProduct[] = []

  for (const fp of FEATURED_CUSTOM_PRODUCTS) {
    const rows = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.sku, fp.sku))
      .limit(1)

    if (rows.length > 0) {
      resolved.push({
        dbId: rows[0].id,
        sku: fp.sku,
        mainImageUrl: fp.mainImageUrl,
      })
    } else {
      console.warn(`[customize] featured product SKU ${fp.sku} not found in DB`)
    }
  }

  return resolved
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

  await mkdir(customizedDir, { recursive: true })

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

      const filename = `${domainSlug}_${product.sku}.png`
      const filePath = path.join(customizedDir, filename)
      await writeFile(filePath, png)

      const publicUrl = customizedImagePublicUrl(
        `${domainSlug}_${product.sku}`,
        options.publicApiUrl,
        generation,
      )
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
