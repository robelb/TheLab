import { GoogleGenAI } from '@google/genai'
import OpenAI from 'openai'
import { resolveLlmConfig } from '../extractor/llmConfig.js'
import {
  AI_SAFE_IMAGE_MIMES,
  canonicalizeImageMime,
} from '../customizer/normalizeImageForAi.js'

const CAPTION_INSTRUCTION =
  'You are a product search assistant for an e-commerce catalog. ' +
  'Describe the single main product shown in the image as a concise search query. ' +
  'Mention the product type, color, material, and notable style features. ' +
  'Do not mention the background, people, watermarks, or logos. ' +
  'Respond with one short phrase only — no preamble, no punctuation at the end.'

/**
 * Validate and canonicalize a user-supplied image MIME for multimodal input.
 * Throws if the type is not one the vision models accept.
 */
export function ensureCaptionableMime(mimeType: string): string {
  const canonical = canonicalizeImageMime(mimeType)
  if (!AI_SAFE_IMAGE_MIMES.has(canonical)) {
    throw new Error(
      `Unsupported image type "${mimeType}". Use JPEG, PNG, WebP, or GIF.`,
    )
  }
  return canonical
}

async function captionWithGemini(
  base64: string,
  mimeType: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey })
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: 'Describe this product for a catalog search.' },
        ],
      },
    ],
    config: { systemInstruction: CAPTION_INSTRUCTION, temperature: 0 },
  })

  const text = response.text
  if (!text) throw new Error('Gemini returned an empty caption.')
  return text.trim()
}

async function captionWithOpenAI(
  base64: string,
  mimeType: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const client = new OpenAI({ apiKey })
  const response = await client.chat.completions.create({
    model,
    temperature: 0,
    messages: [
      { role: 'system', content: CAPTION_INSTRUCTION },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Describe this product for a catalog search.',
          },
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64}` },
          },
        ],
      },
    ],
  })

  const text = response.choices[0]?.message?.content
  if (!text) throw new Error('OpenAI returned an empty caption.')
  return text.trim()
}

/**
 * Turn an uploaded product image into a short text search query using the
 * configured vision model. The caption is then embedded with the same model
 * used for product text, so it can be matched against the existing
 * `products.embedding` column.
 */
export async function captionImageForSearch(
  base64: string,
  mimeType: string,
): Promise<string> {
  const llm = resolveLlmConfig()
  if (!llm) {
    throw new Error(
      'Server missing AI credentials. Set OPENAI_API_KEY or GEMINI_API_KEY in backend/.env.',
    )
  }

  const safeMime = ensureCaptionableMime(mimeType)

  return llm.provider === 'openai'
    ? captionWithOpenAI(base64, safeMime, llm.apiKey, llm.model)
    : captionWithGemini(base64, safeMime, llm.apiKey, llm.model)
}
