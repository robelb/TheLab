import { Router } from 'express'
import { z } from 'zod'
import { saveImages } from './uploads.service.js'

const uploadSchema = z.object({
  images: z
    .array(z.string().min(1))
    .min(1, 'At least one image is required')
    .max(10, 'Up to 10 images per upload'),
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
