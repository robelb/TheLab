import { analyze } from '../extractor/analyze.js'
import type { LlmConfig } from '../extractor/llmConfig.js'
import type { ExtractionResult } from '../extractor/types.js'
import {
  getBrandImageAssetsFromExtraction,
  hasAnyBrandImage,
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

export interface AnalyzeWithCustomizationResult extends ExtractionResult {
  customizedProducts?: CustomizedProductSummary[]
  /** Changes on each login so clients can bust image caches. */
  customizationGeneration?: number
  customizationSkipped?: string
  customizationError?: string
}

/**
 * Brand extract for login, then customized mockups for featured products in parallel.
 * Customization failures do not fail extraction (brand still applies).
 */
export async function analyzeWithCustomization(
  inputUrl: string,
  llm: LlmConfig,
): Promise<AnalyzeWithCustomizationResult> {
  const extraction = await analyze(inputUrl, llm)
  const brandAssets = getBrandImageAssetsFromExtraction(extraction)

  if (!hasAnyBrandImage(brandAssets)) {
    return {
      ...extraction,
      customizationSkipped:
        'No fetchable logo or favicon URL in extraction result.',
    }
  }

  const imageLlm = resolveImageLlmConfig()
  if (!imageLlm) {
    return {
      ...extraction,
      customizationSkipped: missingImageLlmConfigMessage(),
    }
  }

  const { logoImageUrl, faviconImageUrl, inlineSvgLogo } =
    normalizeBrandImageUrls(brandAssets)

  try {
    const { generation, results, failures } = await runCustomize({
      companyName: brandAssets.companyName,
      logoImageUrl,
      faviconImageUrl,
      inlineSvgLogo,
      imageLlm,
    })

    if (results.length === 0) {
      return {
        ...extraction,
        customizationGeneration: generation,
        customizationError: failures
          .map((f) => `${f.productId}: ${f.message}`)
          .join('; '),
      }
    }

    return {
      ...extraction,
      customizationGeneration: generation,
      customizedProducts: results.map(toSummary),
      ...(failures.length > 0
        ? {
            customizationError: failures
              .map((f) => `${f.productId}: ${f.message}`)
              .join('; '),
          }
        : {}),
    }
  } catch (err) {
    return {
      ...extraction,
      customizationError:
        err instanceof Error ? err.message : 'Product customization failed',
    }
  }
}

function toSummary(result: RunCustomizeResult): CustomizedProductSummary {
  return {
    productId: result.productId,
    publicUrl: result.publicUrl,
  }
}
