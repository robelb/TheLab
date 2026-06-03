import {
  fetchedImageFromInlineSvg,
} from './normalizeImageForAi.js'
import { fetchImageOptional, type FetchedImage } from './fetchImage.js'

export interface BrandImageUrls {
  logoImageUrl?: string | null
  faviconImageUrl?: string | null
  inlineSvgLogo?: string | null
}

export interface FetchedBrandImages {
  logo?: FetchedImage
  favicon?: FetchedImage
}

/** Fetch logo and/or favicon once per customize run (shared across products). */
export async function fetchBrandImages(
  urls: BrandImageUrls,
): Promise<FetchedBrandImages> {
  const logoUrl = urls.logoImageUrl?.trim() || undefined
  const faviconUrl = urls.faviconImageUrl?.trim() || undefined
  const inlineSvg = urls.inlineSvgLogo?.trim() || undefined

  let logo: FetchedImage | undefined

  if (inlineSvg) {
    try {
      logo = await fetchedImageFromInlineSvg(inlineSvg)
      console.error('[customize] logo: inline SVG converted to PNG')
    } catch (err) {
      console.error(
        '[customize] inline SVG logo failed:',
        (err as Error).message,
      )
    }
  }

  if (!logo && logoUrl) {
    logo = (await fetchImageOptional(logoUrl, 'logo')) ?? undefined
    if (logo?.convertedForAi) {
      console.error(`[customize] logo: converted for AI (${logoUrl})`)
    }
  }

  const favicon = faviconUrl
    ? ((await fetchImageOptional(faviconUrl, 'favicon')) ?? undefined)
    : undefined

  if (!logo && !favicon) {
    throw new Error('Could not fetch any brand image (logo or favicon).')
  }

  if (!favicon && faviconUrl) {
    console.warn(
      `[customize] favicon not used (${faviconUrl}); continuing with logo only`,
    )
  }

  return { logo, favicon }
}
