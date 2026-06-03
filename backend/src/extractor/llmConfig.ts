import { env } from '../config/env.js'

export type LlmProvider = 'openai' | 'gemini'

export interface LlmConfig {
  provider: LlmProvider
  apiKey: string
  model: string
}

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
