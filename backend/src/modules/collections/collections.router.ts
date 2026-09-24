import { Router, type Response } from 'express'
import { routeParam } from '../../lib/routeParam.js'
import type { ZodError } from 'zod'
import { optionalAuth, requireAuth, requireCapability } from '../../middleware/auth.js'
import {
  collectionMembersQuerySchema,
  collectionMembershipSchema,
  createCollectionSchema,
  updateCollectionSchema,
} from './collections.schema.js'
import { publicErrorMessage } from '../../lib/dbErrors.js'
import {
  SlugTakenError,
  createCollection,
  deleteCollection,
  getActiveCollectionBySlug,
  listCollectionMembers,
  listCollections,
  setCollectionMembership,
  updateCollection,
} from './collections.service.js'

/** What the admin form calls each field, so a refusal can say which one. */
const FIELD_LABELS: Record<string, string> = {
  slug: 'URL segment',
  tag: 'Occasion tag',
  'title.de': 'Headline (German)',
  'title.en': 'Headline (English)',
  title: 'Headline',
  'subtitle.de': 'Subheading (German)',
  'subtitle.en': 'Subheading (English)',
  subtitle: 'Subheading',
  featuredBundleIds: 'Boxes shown first',
  defaultLocale: 'Language visitors get',
  sortOrder: 'Sort order',
  add: 'Products to add',
  remove: 'Products to remove',
  page: 'Page',
  limit: 'Rows per page',
  q: 'Search',
  kind: 'Kind',
}

/**
 * The first thing wrong with the request, naming the field it is about.
 *
 * Zod's own wording ("String must contain at least 1 character(s)") says
 * nothing about where; with the path it comes out as "Headline (German): is
 * required" and the person knows which box to fill in.
 */
function firstZodError(error: ZodError): { error: string; field?: string } {
  const issue = error.issues[0]
  if (!issue) return { error: 'Invalid request' }
  const path = issue.path.join('.')
  const label = FIELD_LABELS[path] ?? FIELD_LABELS[String(issue.path[0])]

  let reason = issue.message
  if (issue.code === 'too_small' && issue.type === 'string' && issue.minimum === 1) {
    reason = 'is required'
  } else if (issue.code === 'too_big' && issue.type === 'string') {
    reason = `must be ${issue.maximum} characters or fewer`
  } else if (issue.code === 'too_big' && issue.type === 'array') {
    reason = `can hold at most ${issue.maximum}`
  } else if (issue.code === 'invalid_type' && issue.received === 'undefined') {
    reason = 'is required'
  }

  return {
    error: label ? `${label}: ${reason}` : reason,
    field: issue.path.length > 0 ? String(issue.path[0]) : undefined,
  }
}

/** A taken slug is the caller's to fix, not a server fault. */
function sendWriteError(
  res: Response,
  err: unknown,
  fallback: string,
  label: string,
) {
  if (err instanceof SlugTakenError) {
    return res.status(409).json({ error: err.message, field: 'slug' })
  }
  console.warn(`[collections] ${label} failed:`, err instanceof Error ? err.message : err)
  return res.status(500).json({ error: publicErrorMessage(err, fallback) })
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
    console.warn('[collections] list failed:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: publicErrorMessage(err, 'Could not load collections') })
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
    const parsed = collectionMembersQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      return res.status(400).json(firstZodError(parsed.error))
    }
    try {
      res.json(
        await listCollectionMembers(routeParam(req, 'id'), {
          ...parsed.data,
          companyId: req.authUser?.companyId ?? undefined,
        }),
      )
    } catch (err) {
      console.warn('[collections] members failed:', err instanceof Error ? err.message : err)
      res.status(500).json({ error: publicErrorMessage(err, 'Could not load the collection') })
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
      return res.status(400).json(firstZodError(parsed.error))
    }
    try {
      const result = await setCollectionMembership(
        routeParam(req, 'id'),
        parsed.data,
      )
      if (!result) return res.status(404).json({ error: 'Collection not found' })
      res.json(result)
    } catch (err) {
      console.warn('[collections] membership failed:', err instanceof Error ? err.message : err)
      res.status(500).json({ error: publicErrorMessage(err, 'Could not update the collection') })
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
    console.warn('[collections] read failed:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: publicErrorMessage(err, 'Could not load collection') })
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
      return res.status(400).json(firstZodError(parsed.error))
    }
    try {
      res.status(201).json(await createCollection(parsed.data))
    } catch (err) {
      sendWriteError(res, err, 'Could not create the landing page', 'create')
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
      return res.status(400).json(firstZodError(parsed.error))
    }
    try {
      const updated = await updateCollection(routeParam(req, 'id'), parsed.data)
      if (!updated) return res.status(404).json({ error: 'Collection not found' })
      res.json(updated)
    } catch (err) {
      sendWriteError(res, err, 'Could not save the landing page', 'update')
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
      console.warn('[collections] delete failed:', err instanceof Error ? err.message : err)
      res.status(500).json({ error: publicErrorMessage(err, 'Could not delete collection') })
    }
  },
)
