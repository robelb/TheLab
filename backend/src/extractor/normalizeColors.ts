import type { BrandData } from './types.js'

interface Hsl {
  h: number
  s: number
  l: number
}

function parseHex(hex: string | null | undefined): Hsl | null {
  if (!hex || typeof hex !== 'string') return null
  const normalized = hex.trim().replace('#', '')
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(normalized)) return null

  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized

  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  const l = (max + min) / 2
  let s = 0

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      default:
        h = ((r - g) / d + 4) / 6
    }
  }

  return { h: h * 360, s, l }
}

/** Canvas colors: white/black, neutrals, very light/dark washes. */
function isLikelyCanvasColor(hex: string | null | undefined): boolean {
  const hsl = parseHex(hex)
  if (!hsl) return false
  return hsl.l >= 0.9 || hsl.l <= 0.12 || hsl.s <= 0.2
}

/** Saturated hues typical of CTAs and brand accents. */
function isLikelyAccentColor(hex: string | null | undefined): boolean {
  const hsl = parseHex(hex)
  if (!hsl) return false
  return hsl.s >= 0.35 && hsl.l >= 0.2 && hsl.l <= 0.78
}

function sameHex(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * Fix common model mistakes: secondaryColor set to accent instead of page background.
 */
export function normalizeBrandColors(data: BrandData): BrandData {
  const colors = data.colors ?? {
    background: null,
    surface: null,
    text: null,
    textMuted: null,
    accent: null,
    border: null,
    link: null,
    success: null,
    warning: null,
    error: null,
  }
  data.colors = colors

  let canvas =
    colors.background ??
    data.secondaryColor ??
    null

  // secondaryColor is often wrongly set to a bright accent — prefer explicit background
  if (
    colors.background &&
    data.secondaryColor &&
    !sameHex(colors.background, data.secondaryColor) &&
    isLikelyAccentColor(data.secondaryColor) &&
    isLikelyCanvasColor(colors.background)
  ) {
    if (!data.primaryColor || sameHex(data.primaryColor, colors.background)) {
      data.primaryColor = data.secondaryColor
    }
    data.secondaryColor = colors.background
    canvas = colors.background
  }

  if (colors.background && !data.secondaryColor) {
    data.secondaryColor = colors.background
    canvas = colors.background
  }

  if (!colors.background && data.secondaryColor && isLikelyCanvasColor(data.secondaryColor)) {
    colors.background = data.secondaryColor
    canvas = data.secondaryColor
  }

  if (!colors.background && canvas && isLikelyCanvasColor(canvas)) {
    colors.background = canvas
  }

  if (canvas) {
    data.secondaryColor = canvas
    if (!colors.background) colors.background = canvas
  }

  if (!colors.surface && canvas) {
    colors.surface = canvas
  }

  if (!colors.accent && data.primaryColor) {
    colors.accent = data.primaryColor
  }

  if (!data.primaryColor && colors.accent) {
    data.primaryColor = colors.accent
  }

  if (!colors.text) {
    const canvasHsl = parseHex(canvas)
    colors.text = canvasHsl && canvasHsl.l < 0.45 ? '#f8fafc' : '#1a1a1a'
  }

  if (!colors.textMuted) {
    colors.textMuted = colors.border ?? null
  }

  return data
}
