import type { FetchedImage } from './fetchImage.js'

/**
 * Measured facts about a brand mark, extracted from the actual image at
 * generation time and injected into the image prompt as ground truth.
 *
 * Why: instruction-only prompts ("keep the layout", "keep the colours") still
 * let the model guess what the correct layout and colours ARE — and it guesses
 * from its own reading of the artwork, re-typesetting wide wordmarks onto
 * multiple lines and "adapting" colours for contrast. Stating the measured
 * aspect ratio and exact palette turns those rules into checkable facts.
 */
export interface BrandMarkFacts {
  /** Tight (trimmed) bounding box of the artwork, in pixels. */
  width: number
  height: number
  /** width / height, rounded to one decimal. */
  aspectRatio: number
  /** Human phrasing of the silhouette, derived from the aspect ratio. */
  shape: string
  /** Dominant artwork colours as hex, most frequent first (backdrop excluded). */
  colors: string[]
}

/** Pixels below this alpha are backdrop, not artwork. */
const OPAQUE_ALPHA = 200
/** All channels at/above this value count as near-white (likely backdrop). */
const NEAR_WHITE = 240
/** A colour must cover at least this share of the artwork to be reported. */
const MIN_COLOR_SHARE = 0.04

function shapeFor(ratio: number): string {
  if (ratio >= 2.2)
    return 'a wide single-line horizontal wordmark, much wider than tall'
  if (ratio >= 1.3) return 'a horizontal mark, wider than tall'
  if (ratio > 0.75) return 'a compact, roughly square mark'
  return 'a vertical mark, taller than wide'
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(v).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/**
 * Measure a brand mark: tight bounding box (so padding in the source file
 * doesn't skew the aspect ratio) and the dominant artwork colours.
 *
 * Best-effort — returns null on any failure so prompts degrade to the
 * instruction-only rules rather than blocking a render.
 */
export async function describeBrandMark(
  image: FetchedImage,
): Promise<BrandMarkFacts | null> {
  try {
    const { default: sharp } = await import('sharp')

    // Trim uniform borders to the artwork's real bounding box. Falls back to
    // the full canvas (e.g. an image trim can't handle) rather than failing.
    let art = image.buffer
    let width: number | undefined
    let height: number | undefined
    try {
      const trimmed = await sharp(image.buffer)
        .trim()
        .toBuffer({ resolveWithObject: true })
      art = trimmed.data
      width = trimmed.info.width
      height = trimmed.info.height
    } catch {
      const meta = await sharp(image.buffer).metadata()
      width = meta.width
      height = meta.height
    }
    if (!width || !height) return null

    // Downsample and histogram the opaque pixels in coarse RGB buckets
    // (8 levels per channel) — plenty for "the logo is navy + white".
    const { data, info } = await sharp(art)
      .resize(48, 48, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const buckets = new Map<
      number,
      { n: number; r: number; g: number; b: number }
    >()
    let opaque = 0
    for (let i = 0; i + 3 < data.length; i += info.channels) {
      if (data[i + 3] < OPAQUE_ALPHA) continue
      opaque++
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5)
      const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
      bucket.n++
      bucket.r += r
      bucket.g += g
      bucket.b += b
      buckets.set(key, bucket)
    }
    if (opaque === 0) return null

    let entries = [...buckets.values()]
      .map((e) => ({ n: e.n, r: e.r / e.n, g: e.g / e.n, b: e.b / e.n }))
      .sort((a, b) => b.n - a.n)

    // Near-white is usually the backdrop the logo sits on, not the artwork —
    // drop it when the mark clearly has other colours. A genuinely white logo
    // (white-on-transparent) has nothing else, so white survives there.
    const isWhite = (e: { r: number; g: number; b: number }) =>
      e.r >= NEAR_WHITE && e.g >= NEAR_WHITE && e.b >= NEAR_WHITE
    const nonWhite = entries.filter((e) => !isWhite(e))
    const nonWhiteShare = nonWhite.reduce((s, e) => s + e.n, 0) / opaque
    if (nonWhite.length < entries.length && nonWhiteShare >= 0.1) {
      entries = nonWhite
    }

    const colors = entries
      .filter((e) => e.n / opaque >= MIN_COLOR_SHARE)
      .slice(0, 3)
      .map((e) => toHex(e.r, e.g, e.b))
    if (colors.length === 0 && entries.length > 0) {
      colors.push(toHex(entries[0].r, entries[0].g, entries[0].b))
    }

    const ratio = width / height
    return {
      width,
      height,
      aspectRatio: Math.round(ratio * 10) / 10,
      shape: shapeFor(ratio),
      colors,
    }
  } catch {
    return null
  }
}
