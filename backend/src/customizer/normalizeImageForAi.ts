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
 */
const MAX_AI_INPUT_EDGE = 1024

async function downscaleForAi(buffer: Buffer, mimeType: string): Promise<Buffer> {
  // GIFs may be animated; resizing would flatten them, so leave as-is.
  if (mimeType === 'image/gif') return buffer

  const { default: sharp } = await import('sharp')
  const meta = await sharp(buffer).metadata()
  const longest = Math.max(meta.width ?? 0, meta.height ?? 0)
  if (longest <= MAX_AI_INPUT_EDGE) return buffer

  // No explicit format call → sharp re-encodes in the original format,
  // preserving PNG/WebP transparency for logos.
  return sharp(buffer)
    .resize(MAX_AI_INPUT_EDGE, MAX_AI_INPUT_EDGE, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toBuffer()
}

async function convertSvgToPng(buffer: Buffer): Promise<Buffer> {
  const { default: sharp } = await import('sharp')
  return sharp(buffer, { density: 300 })
    .resize(512, 512, {
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
): FetchedImage & { originalMimeType: string; converted: boolean } {
  return {
    buffer,
    mimeType,
    base64: buffer.toString('base64'),
    originalMimeType,
    converted,
    convertedForAi: converted,
  }
}

export interface NormalizeImageOptions {
  role: ImageFetchRole
  sourceUrl?: string
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
  const originalMimeType = image.mimeType
  const mimeType = resolveImageMime(
    image.buffer,
    image.mimeType,
    image.mimeType,
  )

  if (AI_SAFE_IMAGE_MIMES.has(mimeType)) {
    const downscaled = await downscaleForAi(image.buffer, mimeType)
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
        const png = await convertSvgToPng(image.buffer)
        return toFetched(png, 'image/png', originalMimeType, true)
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
): Promise<FetchedImage> {
  const buffer = Buffer.from(svgMarkup, 'utf8')
  const normalized = await normalizeImageForAi(
    { buffer, mimeType: 'image/svg+xml', base64: buffer.toString('base64') },
    { role: 'logo', sourceUrl: 'inline-svg' },
  )
  return normalized
}
