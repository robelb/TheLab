export type LlmProvider = 'openai' | 'gemini'

export interface LlmConfig {
  provider: LlmProvider
  apiKey: string
  model: string
}
