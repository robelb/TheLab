import { Router } from 'express'
import { routeParam } from '../../lib/routeParam.js'
import type { ZodError } from 'zod'
import { optionalAuth, requireAuth, requireCapability } from '../../middleware/auth.js'
import {
  collectionMembershipSchema,
  createCollectionSchema,
  updateCollectionSchema,
} from './collections.schema.js'
import {
  createCollection,
  deleteCollection,
  getActiveCollectionBySlug,
  listCollectionMembers,
  listCollections,
  setCollectionMembership,
  updateCollection,
} from './collections.service.js'

function firstZodError(error: ZodError): string {
  const { fieldErrors, formErrors } = error.flatten()
  const field = Object.values(fieldErrors).flat().find(Boolean)
  return field ?? formErrors[0] ?? 'Invalid request'
}

export const collectionsRouter = Router()

// Reads are public — this is what an ad click lands on, before any account
// exists. A signed-in visitor still gets their company's branded pictures.
collectionsRouter.use(optionalAuth)

/** Every live collection. Used by the dashboard and for link building. */
collectionsRouter.get('/', async (req, res) => {
  const all = req.query.all === 'true' && req.authUser?.role === 'super_admin'
  try {
    res.json({
      data: await listCollections({
        activeOnly: !all,
        companyId: req.authUser?.companyId ?? undefined,
      }),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load collections'
    console.warn('[collections] list failed:', message)
    res.status(500).json({ error: message })
  }
})

/**
 * What is on this collection's page.
 *
 * Keyed by id rather than slug, and separate from the collection itself,
 * because this is the editing view: it answers "what is in here" for a screen
 * that is about to change it.
 */
collectionsRouter.get(
  '/:id/products',
  requireAuth,
  requireCapability('manage_all'),
  async (req, res) => {
    try {
      const data = await listCollectionMembers(
        routeParam(req, 'id'),
        req.authUser?.companyId ?? undefined,
      )
      res.json({ data })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not load the collection'
      console.warn('[collections] members failed:', message)
      res.status(500).json({ error: message })
    }
  },
)

collectionsRouter.post(
  '/:id/products',
  requireAuth,
  requireCapability('manage_all'),
  async (req, res) => {
    const parsed = collectionMembershipSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) })
    }
    try {
      const data = await setCollectionMembership(
        routeParam(req, 'id'),
        parsed.data,
      )
      res.json({ data })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not update the collection'
      console.warn('[collections] membership failed:', message)
      res.status(500).json({ error: message })
    }
  },
)

collectionsRouter.get('/:slug', async (req, res) => {
  try {
    const collection = await getActiveCollectionBySlug(
      routeParam(req, 'slug').toLowerCase(),
      req.authUser?.companyId ?? undefined,
    )
    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' })
    }
    res.json(collection)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load collection'
    console.warn('[collections] read failed:', message)
    res.status(500).json({ error: message })
  }
})

// Writing one is a marketing decision that changes a public landing page, so
// it stays with the global administrator rather than any company owner.
collectionsRouter.post(
  '/',
  requireAuth,
  requireCapability('manage_all'),
  async (req, res) => {
    const parsed = createCollectionSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) })
    }
    try {
      res.status(201).json(await createCollection(parsed.data))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create collection'
      console.warn('[collections] create failed:', message)
      res.status(500).json({ error: message })
    }
  },
)

collectionsRouter.patch(
  '/:id',
  requireAuth,
  requireCapability('manage_all'),
  async (req, res) => {
    const parsed = updateCollectionSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) })
    }
    try {
      const updated = await updateCollection(routeParam(req, 'id'), parsed.data)
      if (!updated) return res.status(404).json({ error: 'Collection not found' })
      res.json(updated)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update collection'
      console.warn('[collections] update failed:', message)
      res.status(500).json({ error: message })
    }
  },
)

collectionsRouter.delete(
  '/:id',
  requireAuth,
  requireCapability('manage_all'),
  async (req, res) => {
    try {
      const removed = await deleteCollection(routeParam(req, 'id'))
      if (!removed) return res.status(404).json({ error: 'Collection not found' })
      res.status(204).end()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not delete collection'
      console.warn('[collections] delete failed:', message)
      res.status(500).json({ error: message })
    }
  },
)
