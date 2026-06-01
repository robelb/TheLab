export type LogoKind = 'url' | 'svg' | 'data-uri' | 'none'

/**
 * Resolve how to render `logo` using logoType when present, otherwise infer from content.
 */
export function resolveLogoKind(
  logo: string | null | undefined,
  logoType: string | null | undefined,
): LogoKind {
  const value = logo?.trim()
  if (!value) return 'none'

  if (value.startsWith('<svg') || value.startsWith('<?xml')) return 'svg'
  if (value.startsWith('data:')) return 'data-uri'

  const declared = logoType?.toLowerCase()
  if (declared === 'svg' || declared === 'url' || declared === 'data-uri') {
    return declared
  }

  return 'url'
}

/** Strip obvious XSS vectors from inline SVG before dangerouslySetInnerHTML. */
export function sanitizeSvgMarkup(svg: string): string {
  return svg
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
}
