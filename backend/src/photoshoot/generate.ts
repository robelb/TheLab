import { GoogleGenAI } from '@google/genai'
import OpenAI, { toFile } from 'openai'
import type { FetchedImage } from '../customizer/fetchImage.js'
import type { ImageLlmConfig } from '../customizer/llmImageConfig.js'
import { env } from '../config/env.js'
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
  /**
   * Aspect ratio for Gemini, as the API names them ("1:1", "3:2", "2:3").
   *
   * Gemini takes this as a parameter, not as prose. Without it the chosen
   * ratio only ever appeared as a sentence in the prompt, which the model was
   * free to ignore — and did, returning a square every time.
   */
  aspectRatio?: string
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
  return generateGemini(prompt, images, config, options)
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
    quality: openAiQuality(),
    size: options.size ?? '1024x1024',
  })

  const b64 = response.data?.[0]?.b64_json
  if (!b64) {
    throw new Error('Image generation returned no data.')
  }
  return Buffer.from(b64, 'base64')
}

/** Whatever `OPENAI_IMAGE_QUALITY` says, narrowed to what the SDK accepts. */
function openAiQuality(): 'low' | 'medium' | 'high' | 'auto' {
  const value = env.OPENAI_IMAGE_QUALITY
  return value === 'low' || value === 'medium' || value === 'high' || value === 'auto'
    ? value
    : 'high'
}

/** Likewise for Gemini's render resolution. */
function geminiImageSize(): string {
  const value = env.GEMINI_IMAGE_SIZE.toUpperCase()
  return value === '1K' || value === '2K' || value === '4K' ? value : '2K'
}

async function generateGemini(
  prompt: string,
  images: FetchedImage[],
  config: ImageLlmConfig,
  options: GenerateOptions,
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
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
      // Both of these were previously left unset, so the API applied its own
      // defaults: 1K, square. The prompt asked for more in words and got
      // neither — resolution and aspect ratio are parameters here, not prose.
      imageConfig: {
        imageSize: geminiImageSize(),
        ...(options.aspectRatio ? { aspectRatio: options.aspectRatio } : {}),
      },
    },
  })

  const responseParts = response.candidates?.[0]?.content?.parts ?? []
  for (const part of responseParts) {
    const data = part.inlineData?.data
    if (data) return Buffer.from(data, 'base64')
  }
  throw new Error('Image generation returned no image in the response.')
}
