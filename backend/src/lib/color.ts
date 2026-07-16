/**
 * Color helpers for brand-color similarity filtering.
 *
 * We compare colors in CIELAB, where straight-line (Euclidean) distance
 * approximates perceived color difference (ΔE) — so "closest to my brand color"
 * matches human intuition far better than distance in raw RGB.
 */

export interface Lab {
  l: number
  a: number
  b: number
}

export interface Rgb {
  r: number
  g: number
  b: number
}

/** Parse `#rrggbb` / `rrggbb` (also accepts `#rgb`) into 0–255 channels. */
export function hexToRgb(hex: string): Rgb | null {
  const raw = hex.trim().replace(/^#/, '')
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  const int = parseInt(full, 16)
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 }
}

/** Normalize any accepted hex form to lowercase `#rrggbb`, or null if invalid. */
export function normalizeHex(hex: string): string | null {
  const rgb = hexToRgb(hex)
  return rgb ? rgbToHex(rgb.r, rgb.g, rgb.b) : null
}

export function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/** sRGB (0–255) → CIELAB (D65 reference white). */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const linear = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const rl = linear(r)
  const gl = linear(g)
  const bl = linear(b)

  // Linear sRGB → XYZ, normalized by the D65 white point.
  const x = (rl * 0.4124 + gl * 0.3576 + bl * 0.1805) / 0.95047
  const y = (rl * 0.2126 + gl * 0.7152 + bl * 0.0722) / 1.0
  const z = (rl * 0.0193 + gl * 0.1192 + bl * 0.9505) / 1.08883

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(x)
  const fy = f(y)
  const fz = f(z)

  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

export function hexToLab(hex: string): Lab | null {
  const rgb = hexToRgb(hex)
  return rgb ? rgbToLab(rgb.r, rgb.g, rgb.b) : null
}

/** Perceptual distance (ΔE*76) between two LAB colors. */
export function labDistance(a: Lab, b: Lab): number {
  return Math.sqrt(
    (a.l - b.l) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2,
  )
}
