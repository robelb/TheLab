import { Router } from 'express'
import {
  catalogCategories,
  filterCatalogProducts,
  getCatalogPriceBounds,
  getCatalogProduct,
} from '../data/catalog.js'
import { productsQuerySchema } from '../schemas/productsQuery.js'

export const productsRouter = Router()

productsRouter.get('/', (req, res) => {
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

  const { page, limit, category, q, minPrice, maxPrice } = parsed.data
  const filtered = filterCatalogProducts(category, q, minPrice, maxPrice)
  const total = filtered.length
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit)
  const start = (page - 1) * limit
  const data = filtered.slice(start, start + limit)

  res.json({
    data,
    categories: catalogCategories,
    priceRange: getCatalogPriceBounds(),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  })
})

productsRouter.get('/:id', (req, res) => {
  const product = getCatalogProduct(req.params.id)
  if (!product) {
    return res.status(404).json({ error: 'Product not found' })
  }
  res.json(product)
})
