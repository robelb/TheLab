import type { ExtractionResult } from '../extractor/types.js'

export interface BrandImageAssets {
  companyName: string | null
  logoUrl: string | null
  faviconUrl: string | null
  /** Inline <svg> logo from extraction (logoType === 'svg'). */
  inlineSvgLogo: string | null
}

function httpUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  return /^https?:\/\//i.test(value) ? value.trim() : null
}

function usableLogoUrl(
  logo: string | null | undefined,
  logoType: string | null | undefined,
): string | null {
  if (!logo || logoType !== 'url') return null
  return httpUrl(logo)
}

/** Favicon: HTTP raster URLs only (no SVG). ICO is OK to fetch but may be skipped later. */
function usableFaviconUrl(value: string | null | undefined): string | null {
  const url = httpUrl(value)
  if (!url) return null
  try {
    const ext = new URL(url).pathname.split('.').pop()?.toLowerCase()
    if (ext === 'svg') return null
  } catch {
    return null
  }
  return url
}

export function getBrandImageAssetsFromExtraction(
  data: ExtractionResult,
): BrandImageAssets {
  const logoUrl = usableLogoUrl(data.logo, data.logoType)
  const inlineSvgLogo =
    data.logo && data.logoType === 'svg' && data.logo.trim().includes('<svg')
      ? data.logo.trim()
      : null
  const faviconUrl = usableFaviconUrl(data.favicon)

  return {
    companyName: data.companyName,
    logoUrl,
    faviconUrl,
    inlineSvgLogo,
  }
}

export function hasAnyBrandImage(assets: BrandImageAssets): boolean {
  return Boolean(assets.logoUrl || assets.faviconUrl || assets.inlineSvgLogo)
}

export function normalizeBrandImageUrls(assets: BrandImageAssets): {
  logoImageUrl?: string
  faviconImageUrl?: string
  inlineSvgLogo?: string
} {
  const logo = assets.logoUrl ?? undefined
  const favicon =
    assets.faviconUrl && assets.faviconUrl !== logo
      ? assets.faviconUrl
      : undefined

  return {
    logoImageUrl: logo,
    faviconImageUrl: favicon,
    inlineSvgLogo: assets.inlineSvgLogo ?? undefined,
  }
}
