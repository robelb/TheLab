import { GoogleGenAI } from '@google/genai'
import { buildCustomizePrompt } from '../systemInstruction/brandCustomize.js'
import type { FetchedImage } from './fetchImage.js'
import type { BrandImagesForEdit } from './generateOpenai.js'
import {
  logCustomizeAiError,
  logCustomizeAiRequest,
  logCustomizeAiResponse,
  type CustomizeAiContext,
} from './logCustomizeAi.js'

function extractImageBytes(response: {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
        inlineData?: { data?: string; mimeType?: string }
      }>
    }
  }>
}): { buffer: Buffer; summary: Record<string, unknown> } {
  const parts = response.candidates?.[0]?.content?.parts ?? []
  const textParts: string[] = []

  for (const part of parts) {
    if (part.text) textParts.push(part.text)
    const data = part.inlineData?.data
    if (data) {
      return {
        buffer: Buffer.from(data, 'base64'),
        summary: {
          textParts,
          imageMime: part.inlineData?.mimeType,
          imageBytes: Buffer.from(data, 'base64').length,
        },
      }
    }
  }

  throw new Error('Gemini returned no image in the response.')
}

export async function generateCustomImageGemini(
  mainImage: FetchedImage,
  brand: BrandImagesForEdit,
  apiKey: string,
  model: string,
  context: CustomizeAiContext = {},
): Promise<Buffer> {
  const ai = new GoogleGenAI({ apiKey })

  const requestBody = {
    model,
    config: { responseModalities: ['TEXT', 'IMAGE'] as const },
    prompt: brand.prompt, // logged only — actual prompt built inside try block
    mainImage: {
      mimeType: mainImage.mimeType,
      bytes: mainImage.buffer.length,
    },
    logoImage: brand.logoImage
      ? {
          mimeType: brand.logoImage.mimeType,
          originalMimeType: brand.logoImage.originalMimeType ?? brand.logoImage.mimeType,
          convertedForAi: brand.logoImage.convertedForAi ?? false,
          bytes: brand.logoImage.buffer.length,
        }
      : null,
    faviconImage: brand.faviconImage
      ? {
          mimeType: brand.faviconImage.mimeType,
          originalMimeType:
            brand.faviconImage.originalMimeType ?? brand.faviconImage.mimeType,
          convertedForAi: brand.faviconImage.convertedForAi ?? false,
          bytes: brand.faviconImage.buffer.length,
        }
      : null,
  }

  logCustomizeAiRequest('gemini', context, requestBody)

  try {
    const prompt = buildCustomizePrompt({
      companyName: context.companyName,
      hasLogo: Boolean(brand.logoImage),
      hasFavicon: Boolean(brand.faviconImage),
    })

    // Multimodal layout: task instructions first, then images in order
    // (product → logo → favicon), so the model has full context when it sees
    // each image.
    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [{ text: prompt }]

    parts.push({
      inlineData: {
        mimeType: mainImage.mimeType,
        data: mainImage.base64,
      },
    })

    if (brand.logoImage) {
      parts.push({
        inlineData: {
          mimeType: brand.logoImage.mimeType,
          data: brand.logoImage.base64,
        },
      })
    }

    if (brand.faviconImage) {
      parts.push({
        inlineData: {
          mimeType: brand.faviconImage.mimeType,
          data: brand.faviconImage.base64,
        },
      })
    }

    const response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts }],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    })

    const { buffer, summary } = extractImageBytes(response)

    logCustomizeAiResponse('gemini', context, {
      candidates: response.candidates?.length ?? 0,
      ...summary,
      modelVersion: response.modelVersion ?? null,
      usageMetadata: response.usageMetadata ?? null,
    })

    return buffer
  } catch (err) {
    logCustomizeAiError('gemini', context, err)
    throw err
  }
}
