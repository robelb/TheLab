/** Dev logging for customize image AI calls only (no API keys, no raw image bytes). */

export interface CustomizeAiContext {
  productId?: string
  mainImageUrl?: string
  logoImageUrl?: string
  faviconImageUrl?: string
  companyName?: string
  prompt?: string
}

function prefix(context: CustomizeAiContext): string {
  return context.productId ? `[customize-ai:${context.productId}]` : '[customize-ai]'
}

export function logCustomizeAiRequest(
  provider: 'openai' | 'gemini',
  context: CustomizeAiContext,
  request: Record<string, unknown>,
): void {
  console.log(`${prefix(context)} request (${provider})`, request)
}

export function logCustomizeAiResponse(
  provider: 'openai' | 'gemini',
  context: CustomizeAiContext,
  response: Record<string, unknown>,
): void {
  console.log(`${prefix(context)} response (${provider})`, response)
}

export function logCustomizeAiError(
  provider: 'openai' | 'gemini',
  context: CustomizeAiContext,
  err: unknown,
): void {
  const error =
    err instanceof Error
      ? { message: err.message, name: err.name, stack: err.stack }
      : { message: String(err) }
  console.error(`${prefix(context)} error (${provider})`, { error })
}
