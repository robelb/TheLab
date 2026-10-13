import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireCapability } from '../../middleware/auth.js'
import { clientMessage } from '../../lib/clientError.js'
import { isMailerConfigured } from '../../services/mailer.js'
import { getNotifySettings, setNotifyEmails } from './settings.service.js'

const notifySchema = z.object({
  emails: z
    .array(z.string().trim().toLowerCase().email('That is not a valid email address'))
    .max(20, 'At most 20 addresses'),
})

/**
 * Settings the team changes from the dashboard. Super admins only: who is
 * told about new requests is big little things' own business.
 */
export const settingsRouter = Router()

settingsRouter.use(requireAuth)
settingsRouter.use(requireCapability('manage_all'))

settingsRouter.get('/notifications', async (_req, res) => {
  try {
    res.json({ ...(await getNotifySettings()), mailerReady: isMailerConfigured() })
  } catch (err) {
    res.status(500).json({ error: clientMessage(err, 'Could not load the notification settings') })
  }
})

settingsRouter.put('/notifications', async (req, res) => {
  const parsed = notifySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' })
  }
  try {
    const saved = await setNotifyEmails(parsed.data.emails, req.authUser?.id)
    res.json({ ...saved, mailerReady: isMailerConfigured() })
  } catch (err) {
    res.status(500).json({ error: clientMessage(err, 'Could not save the notification settings') })
  }
})
