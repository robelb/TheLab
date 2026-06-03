import { Router } from 'express'
import { productsQuerySchema } from './products.schema.js'
import {
  getProductById,
  getRelatedProducts,
  listProducts,
} from './products.service.js'

export const productsRouter = Router()

productsRouter.get('/', async (req, res) => {
  const parsed = productsQuerySchema.safeParse(req.query)

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors
    const message =
      fieldErrors.page?.[0] ??
      fieldErrors.limit?.[0] ??
      fieldErrors.category?.[0] ??
      'Invalid query parameters'
    return res.status(400).json({ error: message })
  }

  const result = await listProducts(parsed.data)
  res.json(result)
})

productsRouter.get('/:id', async (req, res) => {
  const domain =
    typeof req.query.domain === 'string' ? req.query.domain : undefined
  const product = await getProductById(req.params.id, domain)
  if (!product) {
    return res.status(404).json({ error: 'Product not found' })
  }
  res.json(product)
})

productsRouter.get('/:id/related', async (req, res) => {
  const domain =
    typeof req.query.domain === 'string' ? req.query.domain : undefined
  const limit = Math.min(
    Math.max(1, Number(req.query.limit) || 4),
    12,
  )

  const related = await getRelatedProducts(req.params.id, limit, domain)
  res.json({ data: related })
})
