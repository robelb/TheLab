import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FEATURED_CUSTOM_PRODUCTS } from './featuredProducts.js'
import { fetchBrandImages } from './fetchBrandImages.js'
import { generateCustomImage } from './generateCustomImage.js'
import type { ImageLlmConfig } from './llmImageConfig.js'
import { resolveLogoUrl } from './resolveLogoUrl.js'
import {
  clearFeaturedCustomizedImages,
  customizedImagePublicUrl,
  updateCatalogCustomizedImages,
} from './updateCatalog.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const customizedDir = path.resolve(__dirname, '../../public/customized')

export interface RunCustomizeOptions {
  companyName?: string | null
  logoImageUrl?: string | null
  faviconImageUrl?: string | null
  inlineSvgLogo?: string | null
  imageLlm: ImageLlmConfig
  publicApiUrl?: string
}

export interface RunCustomizeResult {
  productId: string
  filePath: string
  publicUrl: string
}

export interface RunCustomizeOutcome {
  /** Bumped on every run so image URLs change and browsers fetch the new brand. */
  generation: number
  results: RunCustomizeResult[]
  failures: Array<{ productId: string; message: string }>
}

/** Generate customized mockups for pinned products and persist to catalog + disk. */
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
  clearFeaturedCustomizedImages()
  console.error(
    `[customize] new brand session — regenerating featured images (v=${generation}), replacing any previous files`,
  )

  const brandImages = await fetchBrandImages({
    logoImageUrl: options.logoImageUrl,
    faviconImageUrl: options.faviconImageUrl,
    inlineSvgLogo: options.inlineSvgLogo,
  })

  console.error(
    `Generating ${FEATURED_CUSTOM_PRODUCTS.length} customized images in parallel (${options.imageLlm.provider}) …`,
    options.companyName ? `brand: ${options.companyName}` : '',
    brandImages.logo ? 'logo: ok' : '',
    brandImages.favicon ? 'favicon: ok' : '',
  )

  const settled = await Promise.allSettled(
    FEATURED_CUSTOM_PRODUCTS.map(async (product) => {
      const png = await generateCustomImage(
        {
          productId: product.id,
          mainImageUrl: product.mainImageUrl,
          companyName: options.companyName,
          logoImage: brandImages.logo,
          faviconImage: brandImages.favicon,
        },
        options.imageLlm,
      )

      const filePath = path.join(customizedDir, `${product.id}.png`)
      await writeFile(filePath, png)

      const publicUrl = customizedImagePublicUrl(
        product.id,
        options.publicApiUrl,
        generation,
      )
      console.error(`  → ${product.id}: ${publicUrl}`)
      return { productId: product.id, filePath, publicUrl }
    }),
  )

  const results: RunCustomizeResult[] = []
  const failures: Array<{ productId: string; message: string }> = []

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i]
    const productId = FEATURED_CUSTOM_PRODUCTS[i].id
    if (outcome.status === 'fulfilled') {
      results.push(outcome.value)
    } else {
      const message =
        outcome.reason instanceof Error
          ? outcome.reason.message
          : String(outcome.reason)
      failures.push({ productId, message })
      console.error(`[customize] ${productId} failed:`, message)
    }
  }

  if (results.length > 0) {
    updateCatalogCustomizedImages(
      Object.fromEntries(results.map((r) => [r.productId, r.publicUrl])),
    )
    console.error('Updated normalizedProducts.json and normalizedProducts.ts')
  }

  return { generation, results, failures }
}

export { resolveLogoUrl }
