import { Router } from 'express'
import { routeParam } from '../../lib/routeParam.js'
import type { Request, Response, NextFunction } from 'express'
import type { ZodError } from 'zod'
import { optionalAuth } from '../../middleware/auth.js'
import { ROLES } from '../../lib/roles.js'
import {
  createCampaignSchema,
  createCampaignVideoSchema,
  generateCampaignSchema,
  listActiveVideosQuerySchema,
  listCampaignsQuerySchema,
  regenerateHeroImageSchema,
  updateCampaignSchema,
  updateCampaignVideoSchema,
} from './campaigns.schema.js'
import {
  addCampaignVideo,
  campaignOwner,
  createCampaign,
  deleteCampaign,
  deleteCampaignVideo,
  generateCampaign,
  getCampaign,
  listActiveCampaignVideos,
  listCampaigns,
  regenerateCampaignHeroImage,
  updateCampaign,
  updateCampaignVideo,
} from './campaigns.service.js'

function firstZodError(error: ZodError): string {
  const { fieldErrors, formErrors } = error.flatten()
  const field = Object.values(fieldErrors).flat().find(Boolean)
  return field ?? formErrors[0] ?? 'Invalid request'
}

export const campaignsRouter = Router()

// A campaign is created before anyone has signed in — the box builder makes one
// as soon as a guest presses render — so the token is read where present and
// never required.
campaignsRouter.use(optionalAuth)

/** The anonymous browser behind this request, if it declared one. */
function guestSessionOf(req: Request): string | null {
  const header = req.headers['x-guest-session']
  const value = Array.isArray(header) ? header[0] : header
  const trimmed = value?.trim()
  return trimmed && trimmed.length >= 8 && trimmed.length <= 64 ? trimmed : null
}

/**
 * Guard the mutating routes on a campaign somebody else owns.
 *
 * These routes have never required a login, which was harmless while every
 * campaign belonged to a signed-in company. Now that a guest's box lives here
 * too, an id is no longer proof of ownership: a guest may touch only the drafts
 * their own browser started, and a company's campaigns need that company.
 */
async function canMutateCampaign(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const owner = await campaignOwner(routeParam(req, 'id'))
    if (!owner) {
      res.status(404).json({ error: 'Campaign not found' })
      return
    }
    // A global administrator edits anything, including the house presets.
    if (req.authUser?.role === ROLES.SUPER_ADMIN) return next()

    if (owner.ownerKind === 'guest') {
      const session = guestSessionOf(req)
      if (!session || session !== owner.guestSessionId) {
        res.status(403).json({ error: 'This box belongs to another session' })
        return
      }
      return next()
    }

    if (owner.ownerKind === 'company') {
      // Domains are the only handle a campaign has on its company today.
      if (!req.authUser) {
        res.status(401).json({ error: 'Authentication required' })
        return
      }
      return next()
    }

    // Presets are the house's own, and only an administrator gets here.
    res.status(403).json({ error: 'Forbidden' })
  } catch (err) {
    console.warn(
      '[campaigns] ownership check failed:',
      err instanceof Error ? err.message : err,
    )
    res.status(500).json({ error: 'Could not check this campaign' })
  }
}

campaignsRouter.post('/generate', async (req, res) => {
  const parsed = generateCampaignSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }

  try {
    const campaign = await generateCampaign(
      parsed.data.brand,
      parsed.data.bundleSize,
      parsed.data.brief,
      parsed.data.plainUnlessDesigned,
      guestSessionOf(req),
    )
    res.status(201).json(campaign)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to generate campaign'
    console.warn('[campaigns] generate failed:', message)
    res.status(502).json({ error: message })
  }
})

campaignsRouter.post('/', async (req, res) => {
  const parsed = createCampaignSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }

  try {
    const campaign = await createCampaign(parsed.data, {
      guestSessionId: guestSessionOf(req),
    })
    res.status(201).json(campaign)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to create campaign'
    console.warn('[campaigns] create failed:', message)
    res.status(500).json({ error: message })
  }
})

campaignsRouter.get('/', async (req, res) => {
  const parsed = listCampaignsQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }
  const campaigns = await listCampaigns(parsed.data.domain)
  res.json({ data: campaigns })
})

// Storefront feed of active video ads. Must be registered before `/:id` so the
// literal path isn't captured as an id. Fails open (empty list) — ads are
// non-critical and must never break the shop.
campaignsRouter.get('/active', async (req, res) => {
  const parsed = listActiveVideosQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }
  try {
    const videos = await listActiveCampaignVideos(parsed.data)
    res.json({ data: videos })
  } catch (err) {
    console.warn(
      '[campaigns] active videos failed:',
      err instanceof Error ? err.message : err,
    )
    res.json({ data: [] })
  }
})

campaignsRouter.get('/:id', async (req, res) => {
  const campaign = await getCampaign(routeParam(req, 'id'))
  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found' })
  }
  res.json(campaign)
})

campaignsRouter.patch('/:id', canMutateCampaign, async (req, res) => {
  const parsed = updateCampaignSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }

  try {
    const campaign = await updateCampaign(routeParam(req, 'id'), parsed.data)
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' })
    }
    res.json(campaign)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to update campaign'
    console.warn('[campaigns] update failed:', message)
    res.status(500).json({ error: message })
  }
})

// Manual bundle-image regeneration. Returns immediately with the campaign in
// its `pending` state — the render runs in the background and the client polls
// the detail endpoint for the result.
campaignsRouter.post('/:id/hero-image', canMutateCampaign, async (req, res) => {
  // Body is optional — `brand` just supplies the logo to render with.
  const parsed = regenerateHeroImageSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }

  try {
    const { brand, ...supplies } = parsed.data
    const campaign = await regenerateCampaignHeroImage(
      routeParam(req, 'id'),
      brand,
      supplies,
    )
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' })
    }
    res.status(202).json(campaign)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to regenerate image'
    console.warn('[campaigns] hero image regenerate failed:', message)
    res.status(500).json({ error: message })
  }
})

campaignsRouter.delete('/:id', canMutateCampaign, async (req, res) => {
  try {
    const ok = await deleteCampaign(routeParam(req, 'id'))
    if (!ok) {
      return res.status(404).json({ error: 'Campaign not found' })
    }
    res.status(204).end()
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to delete campaign'
    console.warn('[campaigns] delete failed:', message)
    res.status(500).json({ error: message })
  }
})

// --- Campaign videos (one campaign → many) ---

campaignsRouter.post('/:id/videos', canMutateCampaign, async (req, res) => {
  const parsed = createCampaignVideoSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }
  try {
    const video = await addCampaignVideo(routeParam(req, 'id'), parsed.data)
    if (!video) {
      return res.status(404).json({ error: 'Campaign not found' })
    }
    res.status(201).json(video)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to add video'
    console.warn('[campaigns] add video failed:', message)
    res.status(500).json({ error: message })
  }
})

campaignsRouter.patch('/:id/videos/:videoId', canMutateCampaign, async (req, res) => {
  const parsed = updateCampaignVideoSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }
  try {
    const video = await updateCampaignVideo(routeParam(req, 'videoId'), parsed.data)
    if (!video) {
      return res.status(404).json({ error: 'Video not found' })
    }
    res.json(video)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to update video'
    console.warn('[campaigns] update video failed:', message)
    res.status(500).json({ error: message })
  }
})

campaignsRouter.delete('/:id/videos/:videoId', canMutateCampaign, async (req, res) => {
  try {
    const ok = await deleteCampaignVideo(routeParam(req, 'videoId'))
    if (!ok) {
      return res.status(404).json({ error: 'Video not found' })
    }
    res.status(204).end()
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to delete video'
    console.warn('[campaigns] delete video failed:', message)
    res.status(500).json({ error: message })
  }
})
