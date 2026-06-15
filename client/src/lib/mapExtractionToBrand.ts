import type { BrandConfig } from '@/config/brand.types'

export interface CustomizedProductSummary {
  productId: string
  publicUrl: string
}

/** Subset of backend brand extraction response used by the shop. */
export interface ExtractionPayload {
  sourceUrl: string
  companyName: string | null
  tagline: string | null
  description: string | null
  industry?: string | null
  keywords?: string[]
  logo: string | null
  logoType: string | null
  favicon: string | null
  primaryColor: string | null
  secondaryColor: string | null
  otherColors: string[]
  fonts: string[]
  colors?: {
    background?: string | null
    surface?: string | null
    text?: string | null
    textMuted?: string | null
    accent?: string | null
    border?: string | null
  }
  typography?: {
    headingFont?: string | null
    bodyFont?: string | null
  }
  customization?: {
    borderRadius?: string | null
    buttonRadius?: string | null
    spacing?: string | null
    buttonStyle?: string | null
    theme?: string | null
    shadows?: string | null
    notes?: string | null
  }
  customizedProducts?: CustomizedProductSummary[]
  customizationGeneration?: number
  customizationSkipped?: string
  customizationError?: string
}

const DEFAULT_PRIMARY = '#6366f1'
const DEFAULT_SECONDARY = '#0f172a'
const DEFAULT_FOREGROUND = '#f8fafc'
const DEFAULT_MUTED = '#94a3b8'
const DEFAULT_ACCENT_ALT = '#020617'

function pickButtonStyle(raw: string | null | undefined): string {
  if (!raw) return 'rounded'
  const lower = raw.toLowerCase()
  if (lower.includes('pill') || lower.includes('full')) return 'pill'
  if (lower.includes('square') || lower.includes('0px')) return 'square'
  return 'rounded'
}

function resolveTheme(
  customizationTheme: string | null | undefined,
  secondary: string,
): 'dark' | 'light' {
  const theme = customizationTheme?.toLowerCase()
  if (theme === 'dark' || theme === 'light') return theme
  if (theme === 'auto') {
    const hex = secondary.replace('#', '')
    if (hex.length !== 6) return 'light'
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance < 0.45 ? 'dark' : 'light'
  }
  return 'light'
}

export function mapExtractionToBrand(data: ExtractionPayload): BrandConfig {
  const colors = data.colors ?? {}
  const primary =
    data.primaryColor ?? colors.accent ?? DEFAULT_PRIMARY
  // Shop theme uses secondaryColor as page background — prefer explicit canvas
  const pageBackground =
    colors.background ?? data.secondaryColor ?? DEFAULT_SECONDARY

  const text = colors.text ?? DEFAULT_FOREGROUND
  const surface = colors.surface ?? DEFAULT_ACCENT_ALT
  const muted = colors.textMuted ?? colors.border ?? DEFAULT_MUTED

  const extra = data.otherColors.filter(
    (c) =>
      c &&
      c.toLowerCase() !== primary.toLowerCase() &&
      c.toLowerCase() !== pageBackground.toLowerCase(),
  )

  const otherColors = [text, surface, muted, ...extra].slice(0, 3)
  while (otherColors.length < 3) {
    otherColors.push(
      [DEFAULT_FOREGROUND, DEFAULT_ACCENT_ALT, DEFAULT_MUTED][otherColors.length]!,
    )
  }

  const typography = data.typography ?? {}
  const fonts =
    data.fonts.length > 0
      ? data.fonts
      : [typography.headingFont, typography.bodyFont].filter(
          (f): f is string => Boolean(f),
        )

  const customization = data.customization ?? {}
  const theme = resolveTheme(customization.theme, pageBackground)

  return {
    sourceUrl: data.sourceUrl,
    companyName: data.companyName ?? 'Your Shop',
    description:
      data.description ?? data.tagline ?? 'Curated products for you.',
    logo: data.logo,
    logoType: data.logoType,
    favicon: data.favicon,
    primaryColor: primary,
    secondaryColor: pageBackground,
    otherColors,
    fonts: fonts.length > 0 ? fonts : ['system-ui'],
    industry: data.industry ?? null,
    keywords: data.keywords ?? [],
    customization: {
      borderRadius:
        customization.borderRadius ??
        customization.buttonRadius ??
        '0.5rem',
      spacing: customization.spacing ?? '1rem',
      buttonStyle: pickButtonStyle(customization.buttonStyle),
      theme,
      shadows: customization.shadows ?? '0 4px 24px rgba(0,0,0,0.12)',
      notes: customization.notes ?? undefined,
    },
  }
}
