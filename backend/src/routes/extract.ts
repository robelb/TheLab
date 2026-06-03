import { Router } from 'express'
import { analyzeWithCustomization } from '../customizer/analyzeWithCustomization.js'
import { logExtractFailure } from '../extractor/logExtractFailure.js'
import { missingLlmConfigMessage, resolveLlmConfig } from '../extractor/llmConfig.js'
import { domainInputSchema } from '../schemas/domainSchema.js'

export const extractRouter = Router()

extractRouter.post('/', async (req, res) => {
  const parsed = domainInputSchema.safeParse(req.body)

  if (!parsed.success) {
    const message =
      parsed.error.flatten().fieldErrors.domain?.[0] ?? 'Invalid domain'
    logExtractFailure('validation', {
      body: req.body,
      issues: parsed.error.flatten().fieldErrors,
    })
    return res.status(400).json({ error: message })
  }

  const domain = parsed.data.domain
  const llm = resolveLlmConfig()
  if (!llm) {
    logExtractFailure('config', { domain })
    return res.status(500).json({
      error: missingLlmConfigMessage(),
    })
  }

  try {
    const result = await analyzeWithCustomization(domain, llm)
    res.json(result)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Brand extraction failed'
    res.status(502).json({ error: message })
  }
})
