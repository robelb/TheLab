import { clientMessage } from '../../lib/clientError.js'
import { Router } from 'express'
import { uploadLimit } from '../../lib/rateLimit.js'
import { requireAuth, requireCapability } from '../../middleware/auth.js'
import multer from 'multer'
import { z } from 'zod'
import {
  logoFileType,
  saveImages,
  saveLogoFile,
  saveVideo,
} from './uploads.service.js'

const uploadSchema = z.object({
  images: z
    .array(z.string().min(1))
    .min(1, 'At least one image is required')
    .max(10, 'Up to 10 images per upload'),
  /** Knock a white background out to transparency — for logos and artwork. */
  transparent: z.boolean().optional(),
})

const MAX_VIDEO_BYTES = 50 * 1024 * 1024 // 50 MB
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('video/')) cb(null, true)
    else cb(new Error('Only video files are allowed'))
  },
})

const MAX_LOGO_BYTES = 10 * 1024 * 1024 // 10 MB
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_BYTES },
  fileFilter: (_req, file, cb) => {
    if (logoFileType(file.mimetype, file.originalname)) cb(null, true)
    else cb(new Error('Please upload a PNG, JPG, SVG or PDF file'))
  },
})

export const uploadsRouter = Router()

uploadsRouter.post('/', uploadLimit, async (req, res) => {
  const parsed = uploadSchema.safeParse(req.body)
  if (!parsed.success) {
    const message =
      parsed.error.flatten().fieldErrors.images?.[0] ?? 'Invalid upload request'
    return res.status(400).json({ error: message })
  }

  try {
    const urls = await saveImages(parsed.data.images, {
      removeWhiteBackground: parsed.data.transparent,
    })
    res.status(201).json({ urls })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to process upload'
    console.warn('[uploads] failed:', message)
    res.status(500).json({ error: clientMessage(err, 'Failed to process upload') })
  }
})

/**
 * A logo for printing — e.g. the box's logo stickers. Multipart (field
 * `logo`), stored byte for byte; returns the stored public URL.
 */
uploadsRouter.post('/logo', uploadLimit, (req, res) => {
  logoUpload.single('logo')(req, res, async (err) => {
    if (err) {
      const message =
        err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
          ? 'The logo file is larger than 10 MB'
          : err instanceof Error
            ? err.message
            : 'Upload failed'
      return res.status(400).json({ error: message })
    }
    if (!req.file) return res.status(400).json({ error: 'No logo file provided' })
    try {
      const type = logoFileType(req.file.mimetype, req.file.originalname)
      if (!type) return res.status(400).json({ error: 'Unsupported logo file type' })
      const url = await saveLogoFile(req.file.buffer, type)
      res.status(201).json({ url })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to store the logo'
      console.warn('[uploads] logo failed:', message)
      res.status(500).json({ error: clientMessage(e, 'Failed to store the logo') })
    }
  })
})

/** Multipart video upload (field name `video`) — returns the stored public URL. */
// Campaign videos come from the dashboard only.
uploadsRouter.post('/video', requireAuth, requireCapability('manage_company'), uploadLimit, (req, res) => {
  videoUpload.single('video')(req, res, async (err) => {
    if (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      return res.status(400).json({ error: message })
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' })
    }
    try {
      const url = await saveVideo(req.file.buffer, req.file.mimetype)
      res.status(201).json({ url })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to store video'
      console.warn('[uploads] video failed:', message)
      res.status(500).json({ error: clientMessage(e, 'Failed to store video') })
    }
  })
})
