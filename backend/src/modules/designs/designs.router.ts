import { Router } from 'express'
import type { ZodError } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import {
  createDesignVersionSchema,
  renameDesignVersionSchema,
} from './designs.schema.js'
import {
  createDesignVersion,
  deleteDesignVersion,
  listDesignVersions,
  renameDesignVersion,
} from './designs.service.js'

function firstZodError(error: ZodError): string {
  const { fieldErrors, formErrors } = error.flatten()
  const field = Object.values(fieldErrors).flat().find(Boolean)
  return field ?? formErrors[0] ?? 'Invalid request'
}

/**
 * Mounted at `/api`, because versions are addressed two ways: nested under the
 * product they belong to when listing or adding, and by their own id once they
 * exist. Splitting that across two routers would put half a feature in the
 * products module.
 */
export const designsRouter = Router()

/**
 * Signing in is what supplies the company, and a version with no company has
 * nobody to belong to — so unlike the flat mockup, this whole surface needs an
 * account. The client keeps working without one; it just has no history.
 */
designsRouter.use('/design-versions', requireAuth)
designsRouter.use('/products/:productId/design-versions', requireAuth)

function companyOf(req: { authUser?: { companyId?: string | null } }) {
  return req.authUser?.companyId ?? null
}

/**
 * Everything past `requireAuth` is authenticated, so a missing company is a
 * permission problem, not an identity one. Kept apart because the client reads
 * 401 as "this token is finished" and signs the person out — which is the right
 * response to a dead token and the wrong one to an account without a company.
 */
function noCompany(res: import('express').Response, action: string) {
  return res
    .status(403)
    .json({ error: `A company account is needed to ${action}.` })
}

designsRouter.get('/products/:productId/design-versions', async (req, res) => {
  const companyId = companyOf(req)
  if (!companyId) {
    return noCompany(res, 'see saved versions')
  }

  try {
    res.json(
      await listDesignVersions({
        companyId,
        productId: req.params.productId,
      }),
    )
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to load saved versions'
    console.warn('[designs] list failed:', message)
    res.status(500).json({ error: message })
  }
})

designsRouter.post('/products/:productId/design-versions', async (req, res) => {
  const companyId = companyOf(req)
  if (!companyId) {
    return noCompany(res, 'save versions')
  }

  const parsed = createDesignVersionSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }

  try {
    const version = await createDesignVersion({
      companyId,
      productId: req.params.productId,
      body: parsed.data,
    })
    res.status(201).json(version)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to save the version'
    console.warn('[designs] create failed:', message)
    res.status(500).json({ error: message })
  }
})

designsRouter.patch('/design-versions/:versionId', async (req, res) => {
  const companyId = companyOf(req)
  if (!companyId) {
    return noCompany(res, 'rename versions')
  }

  const parsed = renameDesignVersionSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }

  try {
    const version = await renameDesignVersion({
      companyId,
      versionId: req.params.versionId,
      label: parsed.data.label,
    })
    // Scoped by company as well as id, so a miss is "not yours or not there" —
    // the same answer either way, which is the one we want to give.
    if (!version) return res.status(404).json({ error: 'Version not found' })
    res.json(version)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to rename the version'
    console.warn('[designs] rename failed:', message)
    res.status(500).json({ error: message })
  }
})

designsRouter.delete('/design-versions/:versionId', async (req, res) => {
  const companyId = companyOf(req)
  if (!companyId) {
    return noCompany(res, 'delete versions')
  }

  try {
    const removed = await deleteDesignVersion({
      companyId,
      versionId: req.params.versionId,
    })
    if (!removed) return res.status(404).json({ error: 'Version not found' })
    res.json({ ok: true })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to delete the version'
    console.warn('[designs] delete failed:', message)
    res.status(500).json({ error: message })
  }
})
