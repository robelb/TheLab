import { Router } from 'express'
import { z } from 'zod'
import { clientMessage } from '../../lib/clientError.js'
import {
  optionalAuth,
  requireAuth,
  requireCapability,
} from '../../middleware/auth.js'
import {
  clearHouseTheme,
  getThemeBundle,
  setHouseTheme,
} from './theme.service.js'

/** The client's `BrandConfig`, loose enough to keep fields it adds later. */
const houseThemeSchema = z.object({
  brand: z
    .object({
      companyName: z.string(),
      primaryColor: z.string(),
      secondaryColor: z.string(),
      otherColors: z.array(z.string()),
      fonts: z.array(z.string()),
      customization: z
        .object({
          borderRadius: z.string(),
          spacing: z.string(),
          buttonStyle: z.string(),
          theme: z.string(),
          shadows: z.string(),
        })
        .passthrough(),
    })
    .passthrough(),
})

/**
 * The themes every open shop checks for updates.
 *
 * Public: the signed-out shop and every collection wear the house theme, so
 * nobody may need an account to see what it is. A signed-in visitor also gets
 * their company's theme.
 */
export const themeRouter = Router()

themeRouter.get('/', optionalAuth, async (req, res) => {
  try {
    const bundle = await getThemeBundle(req.authUser?.companyId)
    // Shops ask often; let the browser keep the body and revalidate it with
    // the ETag Express sets, so an unchanged theme costs a 304. Private and
    // varied by token, because the company half belongs to the caller.
    res.set('Cache-Control', 'private, no-cache')
    res.vary('Authorization')
    res.json(bundle)
  } catch (err) {
    res.status(500).json({ error: clientMessage(err, 'Could not load the theme') })
  }
})

themeRouter.put(
  '/house',
  requireAuth,
  requireCapability('manage_all'),
  async (req, res) => {
    const parsed = houseThemeSchema.safeParse(req.body)
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? 'Invalid theme' })
    }
    try {
      res.json(await setHouseTheme(parsed.data.brand, req.authUser?.id))
    } catch (err) {
      res.status(500).json({ error: clientMessage(err, 'Could not save the theme') })
    }
  },
)

themeRouter.delete(
  '/house',
  requireAuth,
  requireCapability('manage_all'),
  async (_req, res) => {
    try {
      await clearHouseTheme()
      res.status(204).end()
    } catch (err) {
      res.status(500).json({ error: clientMessage(err, 'Could not reset the theme') })
    }
  },
)
