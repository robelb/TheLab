import { Router } from 'express'
import type { ZodError } from 'zod'
import {
  createCampaignSchema,
  createCampaignVideoSchema,
  generateCampaignSchema,
  listActiveVideosQuerySchema,
  listCampaignsQuerySchema,
  updateCampaignSchema,
  updateCampaignVideoSchema,
} from './campaigns.schema.js'
import {
  addCampaignVideo,
  createCampaign,
  deleteCampaign,
  deleteCampaignVideo,
  generateCampaign,
  getCampaign,
  listActiveCampaignVideos,
  listCampaigns,
  updateCampaign,
  updateCampaignVideo,
} from './campaigns.service.js'

function firstZodError(error: ZodError): string {
  const { fieldErrors, formErrors } = error.flatten()
  const field = Object.values(fieldErrors).flat().find(Boolean)
  return field ?? formErrors[0] ?? 'Invalid request'
}

export const campaignsRouter = Router()

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
    const campaign = await createCampaign(parsed.data)
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
  const campaign = await getCampaign(req.params.id)
  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found' })
  }
  res.json(campaign)
})

campaignsRouter.patch('/:id', async (req, res) => {
  const parsed = updateCampaignSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }

  try {
    const campaign = await updateCampaign(req.params.id, parsed.data)
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

campaignsRouter.delete('/:id', async (req, res) => {
  try {
    const ok = await deleteCampaign(req.params.id)
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

campaignsRouter.post('/:id/videos', async (req, res) => {
  const parsed = createCampaignVideoSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }
  try {
    const video = await addCampaignVideo(req.params.id, parsed.data)
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

campaignsRouter.patch('/:id/videos/:videoId', async (req, res) => {
  const parsed = updateCampaignVideoSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }
  try {
    const video = await updateCampaignVideo(req.params.videoId, parsed.data)
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

campaignsRouter.delete('/:id/videos/:videoId', async (req, res) => {
  try {
    const ok = await deleteCampaignVideo(req.params.videoId)
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
