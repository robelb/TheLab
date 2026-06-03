import type { LlmProvider } from '../extractor/llmConfig.js'

export interface ImageLlmConfig {
  provider: LlmProvider
  apiKey: string
  model: string
}

const DEFAULT_OPENAI_IMAGE_MODEL = 'gpt-image-1'
const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-2.0-flash-preview-image-generation'

/** Prefer OpenAI when OPENAI_API_KEY is set; otherwise Gemini (same as text extract). */
export function resolveImageLlmConfig(): ImageLlmConfig | null {
  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  if (openaiKey) {
    return {
      provider: 'openai',
      apiKey: openaiKey,
      model:
        process.env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_OPENAI_IMAGE_MODEL,
    }
  }

  const geminiKey = process.env.GEMINI_API_KEY?.trim()
  if (geminiKey) {
    return {
      provider: 'gemini',
      apiKey: geminiKey,
      model:
        process.env.GEMINI_IMAGE_MODEL?.trim() || DEFAULT_GEMINI_IMAGE_MODEL,
    }
  }

  return null
}

export function missingImageLlmConfigMessage(): string {
  return (
    'Missing AI credentials for image generation. Set OPENAI_API_KEY or GEMINI_API_KEY in backend/.env ' +
    '(OpenAI is used when OPENAI_API_KEY is present).'
  )
}
