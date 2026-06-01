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

function setColorVar(root: HTMLElement, name: string, hex: string) {
  const hsl = hexToHslChannels(hex)
  if (hsl) root.style.setProperty(name, hsl)
}

export function applyBrandTheme(brand: BrandConfig) {
  const root = document.documentElement
  const [foreground = '#ffffff', accentAlt = '#000000', muted = '#b3b3b3'] =
    brand.otherColors

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
  setColorVar(root, '--secondary', muted)
  setColorVar(root, '--secondary-foreground', foreground)
  setColorVar(root, '--muted', muted)
  setColorVar(root, '--muted-foreground', muted)
  setColorVar(root, '--accent', brand.primaryColor)
  setColorVar(root, '--accent-foreground', accentAlt)
  setColorVar(root, '--destructive', '#e91429')
  setColorVar(root, '--destructive-foreground', foreground)
  setColorVar(root, '--border', muted)
  setColorVar(root, '--input', muted)
  setColorVar(root, '--ring', brand.primaryColor)

  root.style.setProperty('--brand-primary', brand.primaryColor)
  root.style.setProperty('--brand-secondary', brand.secondaryColor)
  root.style.setProperty('--brand-foreground', foreground)
  root.style.setProperty('--brand-muted', muted)
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

  document.title = `${brand.companyName} Shop`

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
  if (meta) meta.setAttribute('content', brand.description)
}
