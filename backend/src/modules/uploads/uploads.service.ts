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
/** Economy encode for user uploads, where the original is not the deliverable. */
const UPLOAD_QUALITY = 82

/**
 * How light a pixel has to be, on every channel, to count as background.
 *
 * Not 255. A white background that has been through a JPEG or a lossy WebP is
 * full of 252s and 254s, and matching pure white alone left every one of them
 * behind — a rash of opaque speckle round the edge of the mark, which is most
 * of what "the image looks broken" turned out to mean.
 */
const BACKGROUND_WHITE = 240

/**
 * Down to here, a light pixel touching the background is the mark's own
 * anti-aliased rim rather than more background: faded in proportion to how
 * close to white it is, instead of being left as a hard grey outline.
 */
const RIM_WHITE = 200

/**
 * Clear the background from a mark supplied on white, and only the background.
 *
 * A flood fill inward from the edges of the frame, so what goes is the white
 * the mark is sitting ON. `unflatten` — which is what this replaces — has no
 * notion of inside or outside: it cleared every white pixel in the image, so
 * the white counter of a roundel, the white lettering inside a badge, the sky
 * in a photograph and the paper inside a letter O all became holes. Artwork
 * with anything white in it came out gutted, and what survived was the
 * compression speckle around those holes.
 *
 * Runs after the resize so the pass is bounded by `MAX_DIMENSION` rather than
 * by whatever a phone camera produced — a flood fill is per-pixel work in JS,
 * and a 24-megapixel upload is not the size to do it at. The rim band is what
 * makes that safe: the resampler blends the mark's edge toward the background,
 * and those blended pixels are faded rather than left as a halo.
 */
async function knockOutBackground(pipeline: sharp.Sharp): Promise<sharp.Sharp> {
  // `toColourspace` before `ensureAlpha`, or a greyscale upload arrives as two
  // bands and every channel offset below is reading the wrong pixel.
  const { data, info } = await pipeline
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height } = info
  const count = width * height
  const lightness = new Uint8Array(count)
  for (let i = 0; i < count; i++) {
    const p = i * 4
    // Already-transparent pixels are background too, so a mark that arrives
    // with its corners cut out does not dam the fill.
    lightness[i] =
      data[p + 3] < 16 ? 255 : Math.min(data[p], data[p + 1], data[p + 2])
  }

  // Marked on the way in, so no index is ever queued twice and the stack
  // cannot outgrow the image.
  const background = new Uint8Array(count)
  const stack = new Int32Array(count)
  let top = 0
  const visit = (i: number) => {
    if (background[i] || lightness[i] < BACKGROUND_WHITE) return
    background[i] = 1
    stack[top++] = i
  }
  for (let x = 0; x < width; x++) {
    visit(x)
    visit((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    visit(y * width)
    visit(y * width + width - 1)
  }
  while (top > 0) {
    const i = stack[--top]
    const x = i % width
    if (x > 0) visit(i - 1)
    if (x < width - 1) visit(i + 1)
    if (i >= width) visit(i - width)
    if (i < count - width) visit(i + width)
  }

  for (let i = 0; i < count; i++) {
    const p = i * 4
    if (background[i]) {
      data[p + 3] = 0
      continue
    }
    const light = lightness[i]
    if (light <= RIM_WHITE) continue
    const x = i % width
    const onEdge =
      (x > 0 && background[i - 1]) ||
      (x < width - 1 && background[i + 1]) ||
      (i >= width && background[i - width]) ||
      (i < count - width && background[i + width])
    if (!onEdge) continue
    const fade = (light - RIM_WHITE) / (BACKGROUND_WHITE - RIM_WHITE)
    data[p + 3] = Math.round(data[p + 3] * (1 - Math.min(1, fade)))
  }

  return sharp(data, { raw: { width, height, channels: 4 } })
}

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
export interface SaveImageOptions {
  prefix?: string
  /**
   * Knock a white background out to transparency.
   *
   * For logos above all: a mark supplied on white reads as a pasted white
   * rectangle the moment it lands on a dark product. Only the background goes
   * — white that the mark itself is made of stays — see `knockOutBackground`.
   */
  removeWhiteBackground?: boolean
  /** Longest edge to keep. Defaults to `MAX_DIMENSION`. */
  maxDimension?: number
  /** WebP quality. Defaults to `UPLOAD_QUALITY`. */
  quality?: number
}

/**
 * Encoding for an image a model just generated, as opposed to one a user
 * uploaded.
 *
 * A render is the deliverable — someone zooms into it to check their logo — so
 * it keeps its full resolution and is compressed lightly. Putting a 2K render
 * through the upload defaults would resize it back to 1600 and re-encode at
 * quality 82, throwing away most of what asking the model for 2K bought.
 */
export const RENDER_IMAGE_OPTIONS = { maxDimension: 2560, quality: 92 } as const

/** Persist a generated image at render quality. See `RENDER_IMAGE_OPTIONS`. */
export async function saveRenderedImage(
  input: string,
  options: SaveImageOptions = {},
): Promise<string> {
  return saveImage(input, { ...RENDER_IMAGE_OPTIONS, ...options })
}

export async function saveImage(
  input: string,
  options: SaveImageOptions = {},
): Promise<string> {
  const prefix = options.prefix ?? 'productPicture'
  const buffer = decodeBase64Image(input)
  const longestEdge = options.maxDimension ?? MAX_DIMENSION
  let pipeline = sharp(buffer).rotate().resize({
    width: longestEdge,
    height: longestEdge,
    fit: 'inside',
    withoutEnlargement: true,
  })
  if (options.removeWhiteBackground) {
    pipeline = await knockOutBackground(pipeline)
  }
  const webp = await pipeline
    // WebP carries alpha, so a knocked-out background survives the encode.
    .webp({ quality: options.quality ?? UPLOAD_QUALITY })
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

export async function saveImages(
  inputs: string[],
  options: SaveImageOptions = {},
): Promise<string[]> {
  return Promise.all(inputs.map((input) => saveImage(input, options)))
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
