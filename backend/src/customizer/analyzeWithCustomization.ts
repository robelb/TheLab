import { analyze } from '../extractor/analyze.js'
import type { LlmConfig } from '../extractor/llmConfig.js'
import type { ExtractionResult } from '../extractor/types.js'
import {
  getBrandImageAssetsFromExtraction,
  normalizeBrandImageUrls,
} from './brandAssets.js'
import {
  missingImageLlmConfigMessage,
  resolveImageLlmConfig,
} from './llmImageConfig.js'
import { runCustomize, type RunCustomizeResult } from './runCustomize.js'

export interface CustomizedProductSummary {
  productId: string
  publicUrl: string
}

export type FeaturedImagesStatus = 'ready' | 'skipped' | 'failed'

export interface FeaturedImagesResult {
  status: FeaturedImagesStatus
  generation?: number
  customizedProducts?: CustomizedProductSummary[]
  /** Skip reason or error detail. */
  message?: string
}

function toSummary(result: RunCustomizeResult): CustomizedProductSummary {
  return { productId: result.productId, publicUrl: result.publicUrl }
}

/**
 * Generate branded featured-product images for a company — the SLOW part
 * (multiple image-gen calls). Designed to run in the background: it never
 * throws, returning a status the caller persists.
 *
 * Onboarding brands products with the LOGO ONLY — the favicon is never sent to
 * the image model here, so a favicon-only brand is skipped rather than printed
 * with a favicon. (The CLI `generate-customized-images` script still allows it.)
 */
export async function customizeFeaturedImages(
  extraction: ExtractionResult,
  companyId: string,
  domain: string,
): Promise<FeaturedImagesResult> {
  const brandAssets = getBrandImageAssetsFromExtraction(extraction)
  const { logoImageUrl, inlineSvgLogo } = normalizeBrandImageUrls(brandAssets)

  if (!logoImageUrl && !inlineSvgLogo) {
    return {
      status: 'skipped',
      message: brandAssets.faviconUrl
        ? 'No usable logo in extraction result (favicon found, but favicons are not used for product branding).'
        : 'No fetchable logo URL in extraction result.',
    }
  }

  const imageLlm = resolveImageLlmConfig()
  if (!imageLlm) {
    return { status: 'skipped', message: missingImageLlmConfigMessage() }
  }

  try {
    const { generation, results, failures } = await runCustomize({
      companyId,
      domain,
      companyName: brandAssets.companyName,
      logoImageUrl,
      inlineSvgLogo,
      imageLlm,
    })

    const failMsg = failures.length
      ? failures.map((f) => `${f.sku}: ${f.message}`).join('; ')
      : undefined

    if (results.length === 0) {
      return { status: 'failed', generation, message: failMsg ?? 'No images generated.' }
    }
    return {
      status: 'ready',
      generation,
      customizedProducts: results.map(toSummary),
      message: failMsg,
    }
  } catch (err) {
    return {
      status: 'failed',
      message: err instanceof Error ? err.message : 'Product customization failed',
    }
  }
}

// ---------------------------------------------------------------------------
// Legacy combined path (blocking theme + images), used by /api/extract preview.
// ---------------------------------------------------------------------------

export interface AnalyzeWithCustomizationResult extends ExtractionResult {
  customizedProducts?: CustomizedProductSummary[]
  customizationGeneration?: number
  customizationSkipped?: string
  customizationError?: string
}

export async function analyzeWithCustomization(
  domain: string,
  llm: LlmConfig,
  companyId?: string,
): Promise<AnalyzeWithCustomizationResult> {
  const extraction = await analyze(domain, llm)
  if (!companyId) {
    return {
      ...extraction,
      customizationSkipped: 'No company context — extraction only.',
    }
  }

  const result = await customizeFeaturedImages(extraction, companyId, domain)
  return {
    ...extraction,
    customizationGeneration: result.generation,
    ...(result.customizedProducts
      ? { customizedProducts: result.customizedProducts }
      : {}),
    ...(result.status === 'skipped' ? { customizationSkipped: result.message } : {}),
    ...(result.status === 'failed' ? { customizationError: result.message } : {}),
  }
}
