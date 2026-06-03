import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyze } from '../extractor/analyze.js'
import type { LlmConfig } from '../extractor/llmConfig.js'
import {
  getBrandImageAssetsFromExtraction,
  hasAnyBrandImage,
  normalizeBrandImageUrls,
} from './brandAssets.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface BrandFileBrand {
  logo?: string | null
  logoType?: string | null
  favicon?: string | null
}

interface BrandFile {
  defaultBrandId?: string
  brands?: BrandFileBrand[]
}

function pickFromBrandJson(): string | null {
  const brandPath = path.resolve(
    __dirname,
    '../../../client/src/config/brand.json',
  )
  let parsed: BrandFile
  try {
    parsed = JSON.parse(readFileSync(brandPath, 'utf-8')) as BrandFile
  } catch {
    return null
  }

  const brand =
    parsed.brands?.find((b) => b.logo || b.favicon) ?? parsed.brands?.[0]
  if (!brand) return null

  if (brand.logo && brand.logoType === 'url' && /^https?:\/\//i.test(brand.logo)) {
    return brand.logo
  }
  if (brand.favicon && /^https?:\/\//i.test(brand.favicon)) {
    return brand.favicon
  }
  return null
}

export interface ResolveLogoUrlOptions {
  explicitLogoUrl?: string
  domain?: string
  llm?: LlmConfig
}

export interface ResolvedBrandAssets {
  companyName: string | null
  logoImageUrl?: string
  faviconImageUrl?: string
}

/** Brand images for customization: explicit flag → extract → brand.json. */
export async function resolveBrandAssets(
  options: ResolveLogoUrlOptions,
): Promise<ResolvedBrandAssets> {
  const explicit = options.explicitLogoUrl?.trim()
  if (explicit) {
    return { companyName: null, logoImageUrl: explicit }
  }

  if (options.domain && options.llm) {
    const extracted = await analyze(options.domain, options.llm)
    const assets = getBrandImageAssetsFromExtraction(extracted)
    if (hasAnyBrandImage(assets)) {
      return {
        companyName: assets.companyName,
        ...normalizeBrandImageUrls(assets),
      }
    }
  }

  const fromBrandFile = pickFromBrandJson()
  if (fromBrandFile) {
    return { companyName: null, logoImageUrl: fromBrandFile }
  }

  throw new Error(
    'No logo URL available. Pass --logo <url>, --domain <site> for extraction, or set logo/favicon in client/src/config/brand.json',
  )
}

/** @deprecated Prefer resolveBrandAssets — returns a single URL for CLI convenience. */
export async function resolveLogoUrl(
  options: ResolveLogoUrlOptions,
): Promise<string> {
  const assets = await resolveBrandAssets(options)
  const url = assets.logoImageUrl ?? assets.faviconImageUrl
  if (!url) {
    throw new Error('No logo or favicon URL resolved.')
  }
  return url
}
