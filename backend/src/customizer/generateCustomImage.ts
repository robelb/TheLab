import { generateCustomImageGemini } from './generateGemini.js'
import { generateCustomImageOpenAI } from './generateOpenai.js'
import {
  buildCustomizePrompt,
  type CustomizePromptContext,
} from './customizePrompt.js'
import type { CustomizeAiContext } from './logCustomizeAi.js'
import type { ImageLlmConfig } from './llmImageConfig.js'
import { fetchImage, fetchImageOptional, type FetchedImage } from './fetchImage.js'

export interface GenerateCustomImageInput {
  mainImageUrl: string
  productId?: string
  companyName?: string | null
  /** Pre-fetched brand images (preferred — avoids duplicate downloads). */
  logoImage?: FetchedImage
  faviconImage?: FetchedImage
  /** Fallback: fetch by URL when pre-fetched buffers are not provided. */
  logoImageUrl?: string | null
  faviconImageUrl?: string | null
}

function promptContext(
  logo?: FetchedImage,
  favicon?: FetchedImage,
  companyName?: string | null,
): CustomizePromptContext {
  return {
    companyName,
    hasLogo: Boolean(logo),
    hasFavicon: Boolean(favicon),
  }
}

/** Composite brand mark onto the product print area using OpenAI or Gemini. */
export async function generateCustomImage(
  input: GenerateCustomImageInput,
  config: ImageLlmConfig,
): Promise<Buffer> {
  const mainImage = await fetchImage(input.mainImageUrl, 'product')

  let logoImage = input.logoImage
  let faviconImage = input.faviconImage

  if (!logoImage && input.logoImageUrl) {
    logoImage =
      (await fetchImageOptional(input.logoImageUrl, 'logo')) ?? undefined
  }
  if (!faviconImage && input.faviconImageUrl) {
    faviconImage =
      (await fetchImageOptional(input.faviconImageUrl, 'favicon')) ?? undefined
  }

  if (!logoImage && !faviconImage) {
    throw new Error('At least one brand image (logo or favicon) is required.')
  }

  const prompt = buildCustomizePrompt(
    promptContext(logoImage, faviconImage, input.companyName),
  )

  const aiContext: CustomizeAiContext = {
    productId: input.productId,
    mainImageUrl: input.mainImageUrl,
    logoImageUrl: input.logoImageUrl ?? undefined,
    faviconImageUrl: input.faviconImageUrl ?? undefined,
    companyName: input.companyName ?? undefined,
    prompt,
  }

  const brand = { logoImage, faviconImage, prompt }

  if (config.provider === 'openai') {
    return generateCustomImageOpenAI(
      mainImage,
      brand,
      config.apiKey,
      config.model,
      aiContext,
    )
  }

  return generateCustomImageGemini(
    mainImage,
    brand,
    config.apiKey,
    config.model,
    aiContext,
  )
}
