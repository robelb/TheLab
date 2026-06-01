import { Router } from 'express'
import { analyze } from '../extractor/analyze.js'
import { domainInputSchema } from '../schemas/domainSchema.js'

export const extractRouter = Router()

extractRouter.post('/', async (req, res) => {
  const parsed = domainInputSchema.safeParse(req.body)

  if (!parsed.success) {
    const message =
      parsed.error.flatten().fieldErrors.domain?.[0] ?? 'Invalid domain'
    return res.status(400).json({ error: message })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return res.status(500).json({
      error: 'Server missing GEMINI_API_KEY. Set it in backend/.env',
    })
  }

  try {
    const result = await analyze(
      parsed.data.domain,
      apiKey,
      process.env.GEMINI_MODEL,
    )
    res.json(result)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Brand extraction failed'
    res.status(502).json({ error: message })
  }
})
