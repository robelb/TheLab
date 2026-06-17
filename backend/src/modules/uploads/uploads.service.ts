import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import {
  apiPublicImageUrl,
} from '../../lib/publicImageUrl.js'
import {
  isSupabaseStorageConfigured,
  uploadToSupabase,
} from '../../services/supabaseStorage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Disk location + public route for uploaded product images. */
export const UPLOADS_DIR = path.join(__dirname, '../../../public/uploads')
const PUBLIC_PATH = '/api/uploads'

const MAX_DIMENSION = 1600

/** Strip an optional `data:<mime>;base64,` prefix and decode to a Buffer. */
function decodeBase64Image(input: string): Buffer {
  const match = /^data:[^;]+;base64,(?<body>.*)$/s.exec(input)
  const body = match?.groups?.body ?? input
  return Buffer.from(body, 'base64')
}

/**
 * Persist a single base64 image as a normalized WebP and return its public URL.
 * Stores to Supabase Storage when configured, otherwise to local disk.
 * Oversized images are downscaled; everything is re-encoded through sharp so we
 * never trust the uploaded bytes verbatim.
 */
export async function saveImage(
  input: string,
  options: { prefix?: string } = {},
): Promise<string> {
  const prefix = options.prefix ?? 'productPicture'
  const buffer = decodeBase64Image(input)
  const webp = await sharp(buffer)
    .rotate()
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer()

  if (isSupabaseStorageConfigured()) {
    return uploadToSupabase(webp, {
      contentType: 'image/webp',
      ext: 'webp',
      prefix,
    })
  }

  // Local-disk fallback (no Firebase credentials configured).
  await mkdir(UPLOADS_DIR, { recursive: true })
  const filename = `${randomUUID()}.webp`
  await writeFile(path.join(UPLOADS_DIR, filename), webp)
  return apiPublicImageUrl(`${PUBLIC_PATH}/${filename}`)
}

export async function saveImages(inputs: string[]): Promise<string[]> {
  return Promise.all(inputs.map((input) => saveImage(input)))
}
