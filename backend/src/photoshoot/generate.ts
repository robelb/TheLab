import { GoogleGenAI } from '@google/genai'
import OpenAI, { toFile } from 'openai'
import type { FetchedImage } from '../customizer/fetchImage.js'
import type { ImageLlmConfig } from '../customizer/llmImageConfig.js'
import {
  normalizeImageForAi,
  resolveImageMime,
  type ImageFetchRole,
} from '../customizer/normalizeImageForAi.js'

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** Build a normalized FetchedImage from a data URL or raw base64 string. */
export async function fetchedImageFromDataUrl(
  input: string,
  role: ImageFetchRole,
): Promise<FetchedImage> {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(input)
  const declaredMime = match?.[1]
  const body = match?.[2] ?? input
  const buffer = Buffer.from(body, 'base64')
  const mimeType = resolveImageMime(buffer, declaredMime, null)

  const normalized = await normalizeImageForAi(
    { buffer, mimeType, base64: buffer.toString('base64') },
    { role },
  )
  return {
    buffer: normalized.buffer,
    mimeType: normalized.mimeType,
    base64: normalized.base64,
  }
}

export type OpenAiImageSize =
  | '1024x1024'
  | '1024x1536'
  | '1536x1024'
  | 'auto'

export interface GenerateOptions {
  /**
   * Output size for OpenAI. A fixed size defines the aspect ratio; `'auto'`
   * lets the model follow the base (e.g. a style image we want to preserve).
   */
  size?: OpenAiImageSize
}

/**
 * Generate a product photo from an ordered list of reference images and a
 * prompt. The FIRST image is treated as the edit base (so it must be the
 * product). Uses OpenAI gpt-image-1 (preferred) or Gemini, mirroring the
 * customizer pipeline. Returns the rendered image as a PNG/encoded Buffer.
 */
export async function generateProductPhoto(
  prompt: string,
  images: FetchedImage[],
  config: ImageLlmConfig,
  options: GenerateOptions = {},
): Promise<Buffer> {
  if (images.length === 0) {
    throw new Error('At least one reference image is required.')
  }
  if (config.provider === 'openai') {
    return generateOpenAI(prompt, images, config, options)
  }
  return generateGemini(prompt, images, config)
}

async function generateOpenAI(
  prompt: string,
  images: FetchedImage[],
  config: ImageLlmConfig,
  options: GenerateOptions,
): Promise<Buffer> {
  const client = new OpenAI({ apiKey: config.apiKey })

  const files = await Promise.all(
    images.map((img, i) =>
      toFile(img.buffer, `ref-${i}.${MIME_EXT[img.mimeType] ?? 'png'}`, {
        type: img.mimeType,
      }),
    ),
  )

  const response = await client.images.edit({
    model: config.model,
    image: files,
    prompt,
    n: 1,
    quality: 'low',
    size: options.size ?? '1024x1024',
  })

  const b64 = response.data?.[0]?.b64_json
  if (!b64) {
    throw new Error('Image generation returned no data.')
  }
  return Buffer.from(b64, 'base64')
}

async function generateGemini(
  prompt: string,
  images: FetchedImage[],
  config: ImageLlmConfig,
): Promise<Buffer> {
  const ai = new GoogleGenAI({ apiKey: config.apiKey })

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [{ text: prompt }]
  for (const img of images) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } })
  }

  const response = await ai.models.generateContent({
    model: config.model,
    contents: [{ role: 'user', parts }],
    config: { responseModalities: ['TEXT', 'IMAGE'] },
  })

  const responseParts = response.candidates?.[0]?.content?.parts ?? []
  for (const part of responseParts) {
    const data = part.inlineData?.data
    if (data) return Buffer.from(data, 'base64')
  }
  throw new Error('Image generation returned no image in the response.')
}
