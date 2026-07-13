import { Router } from 'express'
import { createShareSchema } from './share.schema.js'
import {
  createShare,
  deleteShare,
  getShareBySlug,
  listSharesForProduct,
  saveShare,
} from './share.service.js'

export const shareRouter = Router()

// Dashboard-only: all generated designs for a product (pending + saved).
shareRouter.get('/product/:productId', async (req, res) => {
  const designs = await listSharesForProduct(req.params.productId)
  res.json({ data: designs })
})

// Mint a public link for any image (defaults to a pending share).
shareRouter.post('/', async (req, res) => {
  const parsed = createShareSchema.safeParse(req.body)
  if (!parsed.success) {
    const { fieldErrors, formErrors } = parsed.error.flatten()
    const message =
      Object.values(fieldErrors).flat().find(Boolean) ??
      formErrors[0] ??
      'Invalid share request'
    return res.status(400).json({ error: message })
  }

  try {
    const { slug } = await createShare(parsed.data)
    res.status(201).json({ slug })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to create share'
    console.warn('[share] create failed:', message)
    res.status(500).json({ error: message })
  }
})

// Public viewer payload.
shareRouter.get('/:slug', async (req, res) => {
  const view = await getShareBySlug(req.params.slug)
  if (!view) {
    return res.status(404).json({ error: 'Share not found' })
  }
  res.json(view)
})

// Promote pending → saved (attach image to the product gallery).
shareRouter.post('/:slug/save', async (req, res) => {
  try {
    const view = await saveShare(req.params.slug)
    res.json(view)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save share'
    const status = message === 'Share not found' ? 404 : 500
    console.warn('[share] save failed:', message)
    res.status(status).json({ error: message })
  }
})

// Remove a generated design record.
shareRouter.delete('/:slug', async (req, res) => {
  const ok = await deleteShare(req.params.slug)
  if (!ok) return res.status(404).json({ error: 'Share not found' })
  res.status(204).end()
})
