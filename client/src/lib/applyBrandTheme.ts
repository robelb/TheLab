import type { BrandConfig } from '@/config/brand.types'

function fontStack(fonts: string[]): string {
  if (fonts.length === 0) return 'system-ui, sans-serif'
  return [...fonts.map((f) => `"${f}"`), 'system-ui', 'sans-serif'].join(', ')
}

function hexToHslChannels(hex: string): string | null {
  const normalized = hex.replace('#', '')
  if (![3, 6].includes(normalized.length)) return null

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
  let s = 0
  const l = (max + min) / 2

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

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

function toRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
}

/** `amount` of `from` laid over `onto`, as a solid colour. */
function mix(from: string, onto: string, amount: number): string {
  const a = toRgb(from)
  const b = toRgb(onto)
  return `#${a
    .map((c, i) => Math.round(c * amount + b[i] * (1 - amount)).toString(16).padStart(2, '0'))
    .join('')}`
}

/**
 * The supporting colours, each its own value.
 *
 * They used to be one: "muted" painted secondary text, placeholders, borders,
 * input outlines and the muted background alike — so a dark grey meant for
 * text turned every muted surface into a dark block, and a placeholder could
 * not be told from something typed. Each is now set on its own in the
 * branding form (`otherColors[3..5]`). Left empty, it is worked out from the
 * text and background colours, so older themes need no edit.
 */
export function brandPalette(brand: BrandConfig) {
  const pick = (value: string | undefined, fallback: string) =>
    value && HEX.test(value) ? value : fallback
  const background = pick(brand.secondaryColor, '#ffffff')
  const foreground = pick(brand.otherColors[0], '#ffffff')
  const accentAlt = pick(brand.otherColors[1], '#000000')
  const mutedText = pick(brand.otherColors[2], '#b3b3b3')
  const borderStrong = pick(brand.otherColors[6], mutedText)
  return {
    background,
    foreground,
    accentAlt,
    /** Secondary text: captions, hints, labels. */
    mutedText,
    /**
     * Resting lines: cards, tiles, dividers, table rows. By default the strong
     * line at 40% — what `border-border` drew before borders had a colour
     * of their own — so a theme that never sets it looks as it did.
     */
    border: pick(brand.otherColors[3], mix(borderStrong, background, 0.4)),
    /** Emphasis lines: hover and selected states, field outlines, outline buttons. */
    borderStrong,
    /** Placeholder text: clearly lighter than anything typed. */
    placeholder: pick(brand.otherColors[4], mix(mutedText, background, 0.55)),
    /** Quiet backgrounds: image wells, chips, hover rows. */
    mutedSurface: pick(brand.otherColors[5], mix(foreground, background, 0.05)),
    /** Secondary buttons: a step stronger than the muted background. */
    secondarySurface: mix(foreground, background, 0.09),
  }
}

function setColorVar(root: HTMLElement, name: string, hex: string) {
  const hsl = hexToHslChannels(hex)
  if (hsl) root.style.setProperty(name, hsl)
}

/**
 * The title and description the brand last set (at first, the ones
 * `index.html` ships with). A page with its own — a collection's name, see
 * `useDocumentMeta` — keeps it when the theme changes underneath, which it now
 * does whenever an open shop picks up a theme update.
 */
let brandTitle = document.title
let brandDescription = document
  .querySelector('meta[name="description"]')
  ?.getAttribute('content')

export function applyBrandTheme(brand: BrandConfig) {
  const root = document.documentElement
  const palette = brandPalette(brand)
  const { foreground, accentAlt } = palette

  const isDark = brand.customization.theme === 'dark'
  root.classList.toggle('dark', isDark)
  root.classList.toggle('light', !isDark)
  root.dataset.theme = brand.customization.theme
  root.dataset.buttonStyle = brand.customization.buttonStyle
  root.dataset.brandSource = brand.sourceUrl

  if (brand.customization.notes?.includes('encore-dark-theme')) {
    root.classList.add('encore-dark-theme')
  } else {
    root.classList.remove('encore-dark-theme')
  }

  setColorVar(root, '--background', brand.secondaryColor)
  setColorVar(root, '--foreground', foreground)
  setColorVar(root, '--card', brand.secondaryColor)
  setColorVar(root, '--card-foreground', foreground)
  setColorVar(root, '--popover', brand.secondaryColor)
  setColorVar(root, '--popover-foreground', foreground)
  setColorVar(root, '--primary', brand.primaryColor)
  setColorVar(root, '--primary-foreground', accentAlt)
  setColorVar(root, '--secondary', palette.secondarySurface)
  setColorVar(root, '--secondary-foreground', foreground)
  setColorVar(root, '--muted', palette.mutedSurface)
  setColorVar(root, '--muted-foreground', palette.mutedText)
  setColorVar(root, '--placeholder', palette.placeholder)
  setColorVar(root, '--accent', brand.primaryColor)
  setColorVar(root, '--accent-foreground', accentAlt)
  setColorVar(root, '--destructive', '#e91429')
  setColorVar(root, '--destructive-foreground', foreground)
  setColorVar(root, '--border', palette.border)
  setColorVar(root, '--border-strong', palette.borderStrong)
  setColorVar(root, '--input', palette.borderStrong)
  setColorVar(root, '--ring', brand.primaryColor)

  root.style.setProperty('--brand-primary', brand.primaryColor)
  root.style.setProperty('--brand-secondary', brand.secondaryColor)
  root.style.setProperty('--brand-foreground', foreground)
  root.style.setProperty('--brand-muted', palette.mutedText)
  root.style.setProperty('--brand-accent-alt', accentAlt)
  root.style.setProperty('--radius', brand.customization.borderRadius)
  root.style.setProperty('--spacing-unit', brand.customization.spacing)
  root.style.setProperty('--shadow-brand', brand.customization.shadows)
  root.style.setProperty('--font-sans', fontStack(brand.fonts))
  root.style.setProperty(
    '--font-display',
    fontStack(brand.fonts.slice(1).length ? brand.fonts.slice(1) : brand.fonts),
  )
  root.style.setProperty(
    '--font-mono',
    brand.fonts.includes('SpotifyMixMono')
      ? '"SpotifyMixMono", ui-monospace, monospace'
      : 'ui-monospace, monospace',
  )

  const title = `${brand.companyName} Shop`
  if (document.title === brandTitle) document.title = title
  brandTitle = title

  if (brand.favicon) {
    let link = document.querySelector<HTMLLinkElement>("link[rel*='icon']")
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = brand.favicon
  }

  const meta = document.querySelector('meta[name="description"]')
  if (meta && meta.getAttribute('content') === brandDescription) {
    meta.setAttribute('content', brand.description)
  }
  brandDescription = brand.description
}
