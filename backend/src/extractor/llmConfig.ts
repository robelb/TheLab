import { env } from '../config/env.js'
import type { LlmConfig } from '../types/llm.js'

export type { LlmConfig, LlmProvider } from '../types/llm.js'

export function resolveLlmConfig(): LlmConfig | null {
  if (env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL,
    }
  }

  if (env.GEMINI_API_KEY) {
    return {
      provider: 'gemini',
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
    }
  }

  return null
}

export function missingLlmConfigMessage(): string {
  return (
    'Server missing AI credentials. Set OPENAI_API_KEY or GEMINI_API_KEY in backend/.env ' +
    '(OpenAI is used when OPENAI_API_KEY is present).'
  )
}
