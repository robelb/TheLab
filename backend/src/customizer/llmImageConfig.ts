import { env } from '../config/env.js'
import type { LlmProvider } from '../extractor/llmConfig.js'

export interface ImageLlmConfig {
  provider: LlmProvider
  apiKey: string
  model: string
}

export function resolveImageLlmConfig(): ImageLlmConfig | null {
  if (env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_IMAGE_MODEL,
    }
  }

  if (env.GEMINI_API_KEY) {
    return {
      provider: 'gemini',
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_IMAGE_MODEL,
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
