import { Router } from 'express'
import { composeSchema } from './compose.schema.js'
import { composeMockup } from './compose.service.js'

export const composeRouter = Router()

composeRouter.post('/', async (req, res) => {
  const parsed = composeSchema.safeParse(req.body)
  if (!parsed.success) {
    const { fieldErrors, formErrors } = parsed.error.flatten()
    const message =
      Object.values(fieldErrors).flat().find(Boolean) ??
      formErrors[0] ??
      'Invalid compose request'
    return res.status(400).json({ error: message })
  }

  try {
    res.json(await composeMockup(parsed.data))
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to build the mockup'
    console.warn('[compose] failed:', message)
    res.status(502).json({ error: message })
  }
})
