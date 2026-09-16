import type { FetchedImage } from './fetchImage.js'

/** MIME types accepted by Gemini / OpenAI image inputs. */
export const AI_SAFE_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

export type ImageFetchRole = 'product' | 'logo' | 'favicon'

/** Favicon (or optional asset) cannot be used — caller should continue with logo only. */
export class SkippableBrandImageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SkippableBrandImageError'
  }
}

const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/x-icon': 'image/x-icon',
  'image/vnd.microsoft.icon': 'image/x-icon',
  'image/svg+xml': 'image/svg+xml',
}

export function detectImageMimeFromBuffer(buffer: Buffer): string | null {
  if (buffer.length < 4) return null

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png'
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return 'image/gif'
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp'
  }
  if (
    buffer[0] === 0x00 &&
    buffer[1] === 0x00 &&
    buffer[2] === 0x01 &&
    buffer[3] === 0x00
  ) {
    return 'image/x-icon'
  }

  const head = buffer.subarray(0, Math.min(buffer.length, 256)).toString('utf8').trimStart()
  if (head.startsWith('<svg') || head.includes('<svg')) {
    return 'image/svg+xml'
  }
  if (head.startsWith('<?xml') && head.includes('<svg')) {
    return 'image/svg+xml'
  }

  return null
}

export function canonicalizeImageMime(mime: string): string {
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? ''
  return MIME_ALIASES[base] ?? base
}

export function resolveImageMime(
  buffer: Buffer,
  headerMime?: string | null,
  urlMime?: string | null,
): string {
  const detected = detectImageMimeFromBuffer(buffer)
  if (detected) return detected

  if (headerMime?.startsWith('image/')) {
    return canonicalizeImageMime(headerMime)
  }
  if (urlMime) return canonicalizeImageMime(urlMime)

  return 'image/png'
}

/**
 * Max edge (px) for raster inputs sent to the image APIs. Token cost scales with
 * input dimensions, not file compression — larger images just add tokens for
 * detail the 1024-output models discard. Logos/favicons are usually smaller and
 * are left untouched (withoutEnlargement).
 *
 * It is the DEFAULT, not the rule: `maxEdge` raises it for callers whose output
 * a person looks at rather than a model. The flat mockup is one — it never
 * touches an image model, so paying a model's token budget only cost it detail.
 */
export const MAX_AI_INPUT_EDGE = 1024

async function downscaleForAi(
  buffer: Buffer,
  mimeType: string,
  maxEdge: number,
): Promise<Buffer> {
  // GIFs may be animated; resizing would flatten them, so leave as-is.
  if (mimeType === 'image/gif') return buffer

  const { default: sharp } = await import('sharp')
  const meta = await sharp(buffer).metadata()
  const longest = Math.max(meta.width ?? 0, meta.height ?? 0)
  if (longest <= maxEdge) return buffer

  // No explicit format call → sharp re-encodes in the original format,
  // preserving PNG/WebP transparency for logos.
  return sharp(buffer)
    .resize(maxEdge, maxEdge, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toBuffer()
}

/**
 * Repair common defects in extracted SVG markup before rasterizing. librsvg
 * (sharp's SVG engine) rejects the whole document over details a browser
 * shrugs off — most commonly an `https://` namespace URI (the spec value is
 * `http://`; LLM extraction likes to "upgrade" it) or a missing xmlns
 * declaration altogether.
 */
function repairSvgMarkup(svgMarkup: string): string {
  let svg = svgMarkup.replace(/^\uFEFF/, '').trim()

  // Namespace URIs are identifiers, not links — https:// variants break librsvg.
  svg = svg.replace(
    /(xmlns(?::[a-zA-Z0-9_-]+)?\s*=\s*["'])https:\/\/(www\.w3\.org\/)/g,
    '$1http://$2',
  )

  const rootTag = svg.match(/<svg[^>]*>/)?.[0]
  if (rootTag && !/\sxmlns\s*=/.test(rootTag)) {
    svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  }
  if (svg.includes('xlink:') && !svg.includes('xmlns:xlink')) {
    svg = svg.replace('<svg', '<svg xmlns:xlink="http://www.w3.org/1999/xlink"')
  }
  return svg
}

/**
 * Raster size a converted logo SVG lands at, longest edge.
 *
 * It stays small because this raster is what goes to the image model, which
 * discards detail beyond its own output size anyway. It is no longer a ceiling
 * on quality: the markup travels alongside as `vector`, so a compositor that
 * needs the mark bigger than this re-renders it rather than upscaling.
 */
const SVG_RASTER_EDGE = 512

async function convertSvgToPng(buffer: Buffer, edge: number): Promise<Buffer> {
  const { default: sharp } = await import('sharp')
  return sharp(buffer, { density: 300 })
    .resize(edge, edge, {
      fit: 'inside',
      withoutEnlargement: false,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()
}

function toFetched(
  buffer: Buffer,
  mimeType: string,
  originalMimeType: string,
  converted: boolean,
  vector?: Buffer,
): FetchedImage & { originalMimeType: string; converted: boolean } {
  return {
    buffer,
    mimeType,
    base64: buffer.toString('base64'),
    originalMimeType,
    converted,
    convertedForAi: converted,
    vector,
  }
}

export interface NormalizeImageOptions {
  role: ImageFetchRole
  sourceUrl?: string
  /** Longest edge to keep, overriding `MAX_AI_INPUT_EDGE`. */
  maxEdge?: number
}

/**
 * Normalize for multimodal APIs.
 * - product: raster only
 * - logo: raster OK; SVG → PNG only (ICO and other types are skipped)
 * - favicon: raster only — never converted (ICO/SVG skipped if not already JPEG/PNG/WebP/GIF)
 */
export async function normalizeImageForAi(
  image: FetchedImage,
  options: NormalizeImageOptions,
): Promise<FetchedImage & { originalMimeType: string; converted: boolean }> {
  const { role, sourceUrl } = options
  const maxEdge = options.maxEdge ?? MAX_AI_INPUT_EDGE
  const originalMimeType = image.mimeType
  const mimeType = resolveImageMime(
    image.buffer,
    image.mimeType,
    image.mimeType,
  )

  if (AI_SAFE_IMAGE_MIMES.has(mimeType)) {
    const downscaled = await downscaleForAi(image.buffer, mimeType, maxEdge)
    const resized = downscaled !== image.buffer
    return toFetched(
      downscaled,
      mimeType,
      originalMimeType,
      resized || mimeType !== originalMimeType,
    )
  }

  if (mimeType === 'image/svg+xml') {
    if (role === 'logo') {
      try {
        // Repaired once, here, so the markup handed on as `vector` is the same
        // markup this raster came from — a compositor re-rendering it at print
        // size must not be the first thing to discover librsvg rejects it.
        const repaired = Buffer.from(
          repairSvgMarkup(image.buffer.toString('utf8')),
          'utf8',
        )
        const png = await convertSvgToPng(repaired, SVG_RASTER_EDGE)
        return toFetched(png, 'image/png', originalMimeType, true, repaired)
      } catch (err) {
        throw new Error(
          `Logo SVG could not be converted to PNG${sourceUrl ? ` (${sourceUrl})` : ''}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
    }
    throw new SkippableBrandImageError(
      `Skipping favicon SVG${sourceUrl ? ` (${sourceUrl})` : ''}`,
    )
  }

  if (mimeType === 'image/x-icon') {
    throw new SkippableBrandImageError(
      `Skipping ${role} ICO${sourceUrl ? ` (${sourceUrl})` : ''}`,
    )
  }

  if (role === 'favicon') {
    throw new SkippableBrandImageError(
      `Skipping unsupported favicon type "${originalMimeType}"${sourceUrl ? ` (${sourceUrl})` : ''}`,
    )
  }

  throw new Error(
    `Unsupported image type "${originalMimeType}"${sourceUrl ? ` from ${sourceUrl}` : ''}. Use JPEG, PNG, WebP, or GIF.`,
  )
}

/** Build a logo image from inline SVG markup returned by brand extraction. */
export async function fetchedImageFromInlineSvg(
  svgMarkup: string,
  options: Omit<NormalizeImageOptions, 'role' | 'sourceUrl'> = {},
): Promise<FetchedImage> {
  const buffer = Buffer.from(svgMarkup, 'utf8')
  const normalized = await normalizeImageForAi(
    { buffer, mimeType: 'image/svg+xml', base64: buffer.toString('base64') },
    { ...options, role: 'logo', sourceUrl: 'inline-svg' },
  )
  return normalized
}
