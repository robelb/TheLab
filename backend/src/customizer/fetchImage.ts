import {
  normalizeImageForAi,
  resolveImageMime,
  SkippableBrandImageError,
  type ImageFetchRole,
} from './normalizeImageForAi.js'

export type { ImageFetchRole } from './normalizeImageForAi.js'

export interface FetchedImage {
  buffer: Buffer
  mimeType: string
  base64: string
  originalMimeType?: string
  convertedForAi?: boolean
}

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
}

function mimeFromUrl(url: string): string | undefined {
  try {
    const ext = new URL(url).pathname.split('.').pop()?.toLowerCase()
    return ext ? EXT_MIME[ext] : undefined
  } catch {
    return undefined
  }
}

/** Download and normalize an image for the AI APIs. */
export async function fetchImage(
  url: string,
  role: ImageFetchRole = 'product',
): Promise<FetchedImage> {
  const result = await fetchImageOptional(url, role)
  if (!result) {
    throw new Error(`Could not use image (${role}): ${url}`)
  }
  return result
}

/**
 * Like fetchImage but returns null when a brand asset is skipped
 * (e.g. favicon .ico, logo .ico). Hard fetch errors still throw for logo/product.
 */
export async function fetchImageOptional(
  url: string,
  role: ImageFetchRole,
): Promise<FetchedImage | null> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TheLabCustomizer/1.0)',
      Accept: 'image/*,*/*;q=0.8',
    },
    redirect: 'follow',
  })

  if (!res.ok) {
    if (role === 'favicon') {
      console.warn(
        `[customize] skipping favicon (HTTP ${res.status}): ${url}`,
      )
      return null
    }
    throw new Error(`Failed to fetch image ${url}: ${res.status} ${res.statusText}`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  const headerMime = res.headers.get('content-type')?.split(';')[0]?.trim()
  const mimeType = resolveImageMime(buffer, headerMime, mimeFromUrl(url))

  try {
    const normalized = await normalizeImageForAi(
      { buffer, mimeType, base64: buffer.toString('base64') },
      { role, sourceUrl: url },
    )

    return {
      buffer: normalized.buffer,
      mimeType: normalized.mimeType,
      base64: normalized.base64,
      originalMimeType: normalized.originalMimeType,
      convertedForAi: normalized.converted,
    }
  } catch (err) {
    if (err instanceof SkippableBrandImageError) {
      console.warn(`[customize] ${err.message}`)
      return null
    }
    if (role === 'favicon') {
      console.warn(
        `[customize] skipping favicon ${url}:`,
        err instanceof Error ? err.message : String(err),
      )
      return null
    }
    throw err
  }
}
