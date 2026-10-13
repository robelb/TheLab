import { clientMessage } from '../../lib/clientError.js'
import { Router } from 'express'
import { aiLimit, campaignCreateLimit, searchLimit } from '../../lib/rateLimit.js'
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
  domainForCompany,
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
 * Who a new campaign belongs to, decided here rather than taken from the body.
 *
 * - A big little things admin may create for any company, or a house preset
 *   (no domain).
 * - Anyone else signed in creates for their own company — whatever domain the
 *   request names, since a domain is the only handle a campaign has on its
 *   company and naming someone else's would hand them a campaign.
 * - A guest creates a draft of their own browser session, and needs one; a
 *   request with neither would otherwise land among the house presets.
 */
async function ownerFor(
  req: Request,
  requestedDomain: string | null | undefined,
): Promise<
  | { domain: string | null; guestSessionId: string | null }
  | { status: number; error: string }
> {
  const user = req.authUser
  if (user?.role === ROLES.SUPER_ADMIN) {
    return { domain: requestedDomain ?? null, guestSessionId: null }
  }
  if (user) {
    const domain = await domainForCompany(user.companyId)
    if (!domain) return { status: 403, error: 'A company account is needed' }
    return { domain, guestSessionId: null }
  }
  const session = guestSessionOf(req)
  if (!session) return { status: 400, error: 'A session is required' }
  return { domain: null, guestSessionId: session }
}

/**
 * Whether the caller acts for the company a domain names: one of its people,
 * or a big little things admin.
 */
async function actsFor(req: Request, domain: string | null): Promise<boolean> {
  const user = req.authUser
  if (!user || !domain) return false
  if (user.role === ROLES.SUPER_ADMIN) return true
  return (await domainForCompany(user.companyId)) === domain
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
      if (!req.authUser) {
        res.status(401).json({ error: 'Authentication required' })
        return
      }
      // Only that company's own people — not anyone with an account.
      if (!(await actsFor(req, owner.domain))) {
        res.status(403).json({ error: 'Forbidden' })
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

/**
 * Changing a campaign's products starts a new photo, so it counts against the
 * image limit like asking for one does. Renaming or approving does not.
 */
function aiWhenRebundled(req: Request, res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object' && 'productIds' in req.body) {
    aiLimit(req, res, next)
    return
  }
  next()
}

/** A search query is turned into an embedding (paid); listing without one is free. */
function searchWhenQueried(req: Request, res: Response, next: NextFunction): void {
  if (typeof req.query.q === 'string' && req.query.q.trim()) {
    searchLimit(req, res, next)
    return
  }
  next()
}

campaignsRouter.post('/generate', aiLimit, async (req, res) => {
  const parsed = generateCampaignSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }

  const owner = await ownerFor(req, parsed.data.brand.domain)
  if ('error' in owner) return res.status(owner.status).json({ error: owner.error })

  try {
    const campaign = await generateCampaign(
      { ...parsed.data.brand, domain: owner.domain },
      parsed.data.bundleSize,
      parsed.data.brief,
      parsed.data.plainUnlessDesigned,
      owner.guestSessionId,
      parsed.data.tag,
    )
    res.status(201).json(campaign)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to generate campaign'
    console.warn('[campaigns] generate failed:', message)
    res.status(502).json({ error: clientMessage(err, 'Failed to generate campaign') })
  }
})

campaignsRouter.post('/', campaignCreateLimit, async (req, res) => {
  const parsed = createCampaignSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }

  const owner = await ownerFor(req, parsed.data.domain)
  if ('error' in owner) return res.status(owner.status).json({ error: owner.error })

  try {
    const campaign = await createCampaign(
      { ...parsed.data, domain: owner.domain },
      { guestSessionId: owner.guestSessionId },
    )
    res.status(201).json(campaign)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to create campaign'
    console.warn('[campaigns] create failed:', message)
    res.status(500).json({ error: clientMessage(err, 'Failed to create campaign') })
  }
})

campaignsRouter.get('/', async (req, res) => {
  const parsed = listCampaignsQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }
  // A company's campaigns are its own business; the house presets (no
  // domain) are what everyone may see.
  const domain = parsed.data.domain
  if (domain && !(await actsFor(req, domain))) {
    return res.status(req.authUser ? 403 : 401).json({
      error: req.authUser ? 'Forbidden' : 'Authentication required',
    })
  }
  const campaigns = await listCampaigns(domain)
  res.json({ data: campaigns })
})

// Storefront feed of active video ads. Must be registered before `/:id` so the
// literal path isn't captured as an id. Fails open (empty list) — ads are
// non-critical and must never break the shop.
campaignsRouter.get('/active', searchWhenQueried, async (req, res) => {
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

campaignsRouter.patch('/:id', aiWhenRebundled, canMutateCampaign, async (req, res) => {
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
    res.status(500).json({ error: clientMessage(err, 'Failed to update campaign') })
  }
})

// Manual bundle-image regeneration. Returns immediately with the campaign in
// its `pending` state — the render runs in the background and the client polls
// the detail endpoint for the result.
campaignsRouter.post('/:id/hero-image', aiLimit, canMutateCampaign, async (req, res) => {
  // Body is optional — `brand` just supplies the logo to render with.
  const parsed = regenerateHeroImageSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }

  try {
    const { brand, productIds, ...supplies } = parsed.data
    const campaign = await regenerateCampaignHeroImage(
      routeParam(req, 'id'),
      brand,
      supplies,
      productIds,
    )
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' })
    }
    res.status(202).json(campaign)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to regenerate image'
    console.warn('[campaigns] hero image regenerate failed:', message)
    res.status(500).json({ error: clientMessage(err, 'Failed to regenerate image') })
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
    res.status(500).json({ error: clientMessage(err, 'Failed to delete campaign') })
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
    res.status(500).json({ error: clientMessage(err, 'Failed to add video') })
  }
})

campaignsRouter.patch('/:id/videos/:videoId', canMutateCampaign, async (req, res) => {
  const parsed = updateCampaignVideoSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }
  try {
    const video = await updateCampaignVideo(
      routeParam(req, 'id'),
      routeParam(req, 'videoId'),
      parsed.data,
    )
    if (!video) {
      return res.status(404).json({ error: 'Video not found' })
    }
    res.json(video)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to update video'
    console.warn('[campaigns] update video failed:', message)
    res.status(500).json({ error: clientMessage(err, 'Failed to update video') })
  }
})

campaignsRouter.delete('/:id/videos/:videoId', canMutateCampaign, async (req, res) => {
  try {
    const ok = await deleteCampaignVideo(routeParam(req, 'id'), routeParam(req, 'videoId'))
    if (!ok) {
      return res.status(404).json({ error: 'Video not found' })
    }
    res.status(204).end()
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to delete video'
    console.warn('[campaigns] delete video failed:', message)
    res.status(500).json({ error: clientMessage(err, 'Failed to delete video') })
  }
})
