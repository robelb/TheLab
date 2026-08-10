import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireCapability } from '../../middleware/auth.js'
import {
  deleteInstruction,
  listInstructions,
  upsertInstruction,
} from './system-instructions.service.js'

const upsertSchema = z.object({
  content: z.string().min(1, 'content is required').max(50_000),
  isActive: z.boolean().optional(),
})

/**
 * Super-admin CRUD for AI prompt overrides. Read + write both require
 * `manage_all` — prompts can reveal product internals and steer every
 * company's image generation, so nothing here is company-scoped.
 */
export const systemInstructionsRouter = Router()

systemInstructionsRouter.use(requireAuth)
systemInstructionsRouter.use(requireCapability('manage_all'))

systemInstructionsRouter.get('/', async (_req, res) => {
  try {
    res.json({ data: await listInstructions() })
  } catch (err) {
    console.warn('[system-instructions] list failed:', err)
    res.status(500).json({ error: 'Failed to list system instructions' })
  }
})

systemInstructionsRouter.put('/:key', async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return res.status(400).json({ error: issue?.message ?? 'Invalid request' })
  }
  try {
    const view = await upsertInstruction(
      req.params.key,
      parsed.data,
      req.authUser?.id,
    )
    if (!view) {
      return res.status(404).json({ error: 'Unknown instruction key' })
    }
    res.json(view)
  } catch (err) {
    console.warn('[system-instructions] upsert failed:', err)
    res.status(500).json({ error: 'Failed to save the instruction' })
  }
})

systemInstructionsRouter.delete('/:key', async (req, res) => {
  try {
    const ok = await deleteInstruction(req.params.key)
    if (!ok) {
      return res.status(404).json({ error: 'Unknown instruction key' })
    }
    res.status(204).end()
  } catch (err) {
    console.warn('[system-instructions] delete failed:', err)
    res.status(500).json({ error: 'Failed to delete the override' })
  }
})
