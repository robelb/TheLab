import { extractBrandData } from './extract.js'
import { fetchHtml, normalizeUrl } from './fetchHtml.js'
import { logExtractFailure } from './logExtractFailure.js'
import {
  missingLlmConfigMessage,
  resolveLlmConfig,
  type LlmConfig,
} from './llmConfig.js'
import type { ExtractionResult } from './types.js'

/** Resolve a possibly-relative URL against the page's base URL. */
function toAbsolute(maybeUrl: string | null, base: string): string | null {
  if (!maybeUrl) return null
  try {
    return new URL(maybeUrl, base).toString()
  } catch {
    return maybeUrl
  }
}

/**
 * Run the full pipeline: fetch HTML → extract with OpenAI or Gemini → normalize URLs.
 * Uses OpenAI when OPENAI_API_KEY is set; otherwise GEMINI_API_KEY.
 */
export async function analyze(
  inputUrl: string,
  llmConfig?: LlmConfig,
): Promise<ExtractionResult> {
  const llm = llmConfig ?? resolveLlmConfig()
  if (!llm) {
    throw new Error(missingLlmConfigMessage())
  }

  const url = normalizeUrl(inputUrl)

  let finalUrl: string
  let html: string
  try {
    ;({ finalUrl, html } = await fetchHtml(url))
  } catch (err) {
    logExtractFailure('fetch', { inputUrl, url }, err)
    throw err
  }

  let data: Awaited<ReturnType<typeof extractBrandData>>
  try {
    data = await extractBrandData(html, finalUrl, llm)
  } catch (err) {
    logExtractFailure(
      'llm',
      {
        inputUrl,
        finalUrl,
        provider: llm.provider,
        model: llm.model,
        htmlLength: html.length,
      },
      err,
    )
    throw err
  }

  const logo =
    data.logoType === 'url' ? toAbsolute(data.logo, finalUrl) : data.logo

  const resolveLinks = <T extends { href: string }>(links: T[]): T[] =>
    links.map((l) => ({ ...l, href: toAbsolute(l.href, finalUrl) ?? l.href }))

  return {
    sourceUrl: finalUrl,
    ...data,
    logo,
    logoDark: toAbsolute(data.logoDark, finalUrl),
    favicon: toAbsolute(data.favicon, finalUrl),
    ogImage: toAbsolute(data.ogImage, finalUrl),
    navLinks: resolveLinks(data.navLinks),
    ctas: resolveLinks(data.ctas),
  }
}
