import { clientMessage } from '../../lib/clientError.js'
import { Router } from 'express'
import { routeParam } from '../../lib/routeParam.js'
import { requireAuth, requireCapability } from '../../middleware/auth.js'
import { createShareSchema } from './share.schema.js'
import {
  createShare,
  deleteShare,
  getShareBySlug,
  listSharesForProduct,
  saveShare,
} from './share.service.js'

export const shareRouter = Router()

/**
 * Everything except the public viewer (`GET /:slug`) is the catalogue
 * dashboard's: minting links for product photoshoots, adding them to a
 * product's gallery, deleting them. Those change what every shop shows, so
 * they are for big little things' own admins.
 */
const catalogueAdmin = requireCapability('manage_all')

// Dashboard-only: all generated designs for a product (pending + saved).
shareRouter.get('/product/:productId', requireAuth, catalogueAdmin, async (req, res) => {
  const designs = await listSharesForProduct(routeParam(req, 'productId'))
  res.json({ data: designs })
})

// Mint a public link for any image (defaults to a pending share).
shareRouter.post('/', requireAuth, catalogueAdmin, async (req, res) => {
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
    res.status(500).json({ error: clientMessage(err, 'Failed to create share') })
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
shareRouter.post('/:slug/save', requireAuth, catalogueAdmin, async (req, res) => {
  try {
    const view = await saveShare(routeParam(req, 'slug'))
    res.json(view)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save share'
    const status = message === 'Share not found' ? 404 : 500
    console.warn('[share] save failed:', message)
    res.status(status).json({ error: clientMessage(err, 'Failed to save share', { known: ['Share not found'] }) })
  }
})

// Remove a generated design record.
shareRouter.delete('/:slug', requireAuth, catalogueAdmin, async (req, res) => {
  const ok = await deleteShare(routeParam(req, 'slug'))
  if (!ok) return res.status(404).json({ error: 'Share not found' })
  res.status(204).end()
})
