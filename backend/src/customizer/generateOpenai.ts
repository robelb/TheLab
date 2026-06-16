import OpenAI, { toFile } from 'openai'
import type { FetchedImage } from './fetchImage.js'
import {
  logCustomizeAiError,
  logCustomizeAiRequest,
  logCustomizeAiResponse,
  type CustomizeAiContext,
} from './logCustomizeAi.js'

export interface BrandImagesForEdit {
  logoImage?: FetchedImage
  faviconImage?: FetchedImage
  prompt: string
}

export async function generateCustomImageOpenAI(
  mainImage: FetchedImage,
  brand: BrandImagesForEdit,
  apiKey: string,
  model: string,
  context: CustomizeAiContext = {},
): Promise<Buffer> {
  const client = new OpenAI({ apiKey })
  const imageLabels: string[] = ['main']

  const requestBody = {
    model,
    image: imageLabels,
    prompt: brand.prompt,
    response_format: 'b64_json' as const,
    quality: 'low' as const,
    size: '1024x1024' as const,
  }

  logCustomizeAiRequest('openai', context, {
    ...requestBody,
    mainImage: {
      mimeType: mainImage.mimeType,
      originalMimeType: mainImage.originalMimeType ?? mainImage.mimeType,
      convertedForAi: mainImage.convertedForAi ?? false,
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
  })

  try {
    const files = [
      await toFile(mainImage.buffer, 'main.jpg', { type: mainImage.mimeType }),
    ]
    if (brand.logoImage) {
      imageLabels.push('logo')
      files.push(
        await toFile(brand.logoImage.buffer, 'logo.png', {
          type: brand.logoImage.mimeType,
        }),
      )
    }
    if (brand.faviconImage) {
      imageLabels.push('favicon')
      files.push(
        await toFile(brand.faviconImage.buffer, 'favicon.png', {
          type: brand.faviconImage.mimeType,
        }),
      )
    }

    const response = await client.images.edit({
      model,
      image: files,
      prompt: brand.prompt,
      response_format: 'b64_json',
      quality: 'low',
      size: '1024x1024',
    })

    const first = response.data?.[0]
    const b64 = first?.b64_json

    logCustomizeAiResponse('openai', context, {
      created: response.created,
      dataCount: response.data?.length ?? 0,
      revised_prompt: first?.revised_prompt ?? null,
      outputBytes: b64 ? Buffer.from(b64, 'base64').length : 0,
      usage: response.usage ?? null,
    })

    if (!b64) {
      throw new Error('OpenAI image edit returned no image data.')
    }

    return Buffer.from(b64, 'base64')
  } catch (err) {
    logCustomizeAiError('openai', context, err)
    throw err
  }
}
