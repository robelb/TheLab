import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { saveImages, saveVideo } from './uploads.service.js'

const uploadSchema = z.object({
  images: z
    .array(z.string().min(1))
    .min(1, 'At least one image is required')
    .max(10, 'Up to 10 images per upload'),
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

export const uploadsRouter = Router()

uploadsRouter.post('/', async (req, res) => {
  const parsed = uploadSchema.safeParse(req.body)
  if (!parsed.success) {
    const message =
      parsed.error.flatten().fieldErrors.images?.[0] ?? 'Invalid upload request'
    return res.status(400).json({ error: message })
  }

  try {
    const urls = await saveImages(parsed.data.images)
    res.status(201).json({ urls })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to process upload'
    console.warn('[uploads] failed:', message)
    res.status(500).json({ error: message })
  }
})

/** Multipart video upload (field name `video`) — returns the stored public URL. */
uploadsRouter.post('/video', (req, res) => {
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
      res.status(500).json({ error: message })
    }
  })
})
