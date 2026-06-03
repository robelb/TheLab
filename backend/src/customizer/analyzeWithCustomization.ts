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
  customizationGeneration?: number
  customizationSkipped?: string
  customizationError?: string
}

export async function analyzeWithCustomization(
  domain: string,
  llm: LlmConfig,
): Promise<AnalyzeWithCustomizationResult> {
  const extraction = await analyze(domain, llm)
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
      domain,
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
          .map((f) => `${f.sku}: ${f.message}`)
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
              .map((f) => `${f.sku}: ${f.message}`)
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
