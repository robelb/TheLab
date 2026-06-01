import { extractBrandData } from './extract.js'
import { fetchHtml, normalizeUrl } from './fetchHtml.js'
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
 * Run the full pipeline: fetch HTML → extract with Gemini → normalize URLs.
 */
export async function analyze(
  inputUrl: string,
  apiKey: string,
  model?: string,
): Promise<ExtractionResult> {
  const url = normalizeUrl(inputUrl)
  const { finalUrl, html } = await fetchHtml(url)
  const data = await extractBrandData(html, finalUrl, apiKey, model)

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
