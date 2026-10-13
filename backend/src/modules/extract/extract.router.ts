import { clientMessage } from '../../lib/clientError.js'
import { Router } from 'express'
import { extractLimit } from '../../lib/rateLimit.js'
import { analyzeWithCustomization } from '../../customizer/analyzeWithCustomization.js'
import { logExtractFailure } from '../../extractor/logExtractFailure.js'
import {
  missingLlmConfigMessage,
  resolveLlmConfig,
} from '../../extractor/llmConfig.js'
import { domainInputSchema } from './extract.schema.js'

export const extractRouter = Router()

extractRouter.post('/', extractLimit, async (req, res) => {
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
    res
      .status(502)
      .json({ error: clientMessage(err, 'Brand extraction failed', { log: 'extract' }) })
  }
})
