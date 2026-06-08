import { Router } from 'express'
import { imageSearchSchema, productsQuerySchema } from './products.schema.js'
import {
  getProductById,
  getRelatedProducts,
  listProducts,
  searchByImage,
} from './products.service.js'

export const productsRouter = Router()

productsRouter.post('/search/image', async (req, res) => {
  const parsed = imageSearchSchema.safeParse(req.body)

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors
    const formErrors = parsed.error.flatten().formErrors
    const message =
      fieldErrors.image?.[0] ??
      fieldErrors.limit?.[0] ??
      formErrors[0] ??
      'Invalid image search request'
    return res.status(400).json({ error: message })
  }

  try {
    const { image, ...rest } = parsed.data
    const result = await searchByImage({ ...rest, imageBase64: image })
    res.json(result)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Image search failed'
    console.warn('[search] image search failed:', message)
    res.status(502).json({ error: message })
  }
})

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
