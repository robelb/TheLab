import { Router } from 'express'
import {
  createProductSchema,
  imageSearchSchema,
  photoshootSchema,
  productsQuerySchema,
  updateProductSchema,
} from './products.schema.js'
import {
  createProduct,
  deleteProduct,
  getProductById,
  getRelatedProducts,
  listProducts,
  runProductPhotoshoot,
  searchByImage,
  updateProduct,
} from './products.service.js'

function firstZodError(error: import('zod').ZodError): string {
  const { fieldErrors, formErrors } = error.flatten()
  const field = Object.values(fieldErrors).flat().find(Boolean)
  return field ?? formErrors[0] ?? 'Invalid request'
}

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

productsRouter.post('/', async (req, res) => {
  const parsed = createProductSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }

  try {
    const product = await createProduct(parsed.data)
    res.status(201).json(product)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to create product'
    console.warn('[products] create failed:', message)
    res.status(500).json({ error: message })
  }
})

productsRouter.patch('/:id', async (req, res) => {
  const parsed = updateProductSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }

  try {
    const product = await updateProduct(req.params.id, parsed.data)
    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }
    res.json(product)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to update product'
    console.warn('[products] update failed:', message)
    res.status(500).json({ error: message })
  }
})

productsRouter.delete('/:id', async (req, res) => {
  try {
    const ok = await deleteProduct(req.params.id)
    if (!ok) {
      return res.status(404).json({ error: 'Product not found' })
    }
    res.status(204).end()
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to delete product'
    console.warn('[products] delete failed:', message)
    res.status(500).json({ error: message })
  }
})

productsRouter.post('/:id/photoshoot', async (req, res) => {
  const parsed = photoshootSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }

  try {
    const result = await runProductPhotoshoot(req.params.id, parsed.data)
    res.json(result)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to generate image'
    const status = message === 'Product not found' ? 404 : 502
    console.warn('[products] photoshoot failed:', message)
    res.status(status).json({ error: message })
  }
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
