import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
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

// ffmpeg-static's default export is the binary path (string | null). Loaded via
// createRequire to sidestep its awkward ESM default-export typings.
const ffmpegPath = createRequire(import.meta.url)('ffmpeg-static') as
  | string
  | null

/** Disk location + public route for uploaded product images. */
export const UPLOADS_DIR = path.join(__dirname, '../../../public/uploads')
const PUBLIC_PATH = '/api/uploads'

/** Disk location + public route for uploaded campaign videos. */
export const VIDEOS_DIR = path.join(__dirname, '../../../public/videos')
const VIDEOS_PUBLIC_PATH = '/api/videos'

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

const VIDEO_EXT_BY_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/ogg': 'ogv',
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error('ffmpeg binary unavailable'))
    const proc = spawn(ffmpegPath, args)
    let stderr = ''
    proc.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    proc.on('error', reject)
    proc.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`)),
    )
  })
}

/**
 * Best-effort MP4 "faststart" remux: moves the moov atom to the front so the
 * browser can begin playback before the whole file downloads (progressive
 * streaming). Stream-copy only (no re-encode), so it's fast and lossless. Only
 * applies to MP4/MOV; returns null on any failure so the caller falls back to
 * the original bytes.
 */
async function faststartRemux(
  buffer: Buffer,
  ext: string,
): Promise<Buffer | null> {
  if (!ffmpegPath || (ext !== 'mp4' && ext !== 'mov')) return null
  // Some ffmpeg-static installs leave the binary non-executable (mode 644).
  await chmod(ffmpegPath, 0o755).catch(() => {})
  const base = path.join(tmpdir(), `campaign-video-${randomUUID()}`)
  const inPath = `${base}.${ext}`
  const outPath = `${base}.faststart.mp4`
  try {
    await writeFile(inPath, buffer)
    await runFfmpeg([
      '-y',
      '-i',
      inPath,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      outPath,
    ])
    return await readFile(outPath)
  } catch (err) {
    console.warn(
      '[uploads] faststart remux skipped:',
      err instanceof Error ? err.message : err,
    )
    return null
  } finally {
    await unlink(inPath).catch(() => {})
    await unlink(outPath).catch(() => {})
  }
}

/**
 * Persist a video buffer and return its public URL. MP4/MOV are remuxed for
 * fast progressive streaming (see `faststartRemux`); otherwise stored verbatim
 * (no sharp re-encode). Uses Supabase Storage when configured, else local disk
 * under `public/videos`.
 */
export async function saveVideo(
  buffer: Buffer,
  mimetype: string,
): Promise<string> {
  let outBuffer = buffer
  let ext = VIDEO_EXT_BY_MIME[mimetype] ?? 'mp4'
  let contentType = mimetype

  const remuxed = await faststartRemux(buffer, ext)
  if (remuxed) {
    outBuffer = remuxed
    ext = 'mp4'
    contentType = 'video/mp4'
  }

  if (isSupabaseStorageConfigured()) {
    return uploadToSupabase(outBuffer, {
      contentType,
      ext,
      prefix: 'campaign-videos',
    })
  }

  await mkdir(VIDEOS_DIR, { recursive: true })
  const filename = `${randomUUID()}.${ext}`
  await writeFile(path.join(VIDEOS_DIR, filename), outBuffer)
  return apiPublicImageUrl(`${VIDEOS_PUBLIC_PATH}/${filename}`)
}
