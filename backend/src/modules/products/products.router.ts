import { Router } from 'express'
import {
  optionalAuth,
  requireAuth,
  requireCapability,
} from '../../middleware/auth.js'
import { createShare } from '../share/share.service.js'
import {
  createProductSchema,
  customizeBoxSchema,
  customizeProductSchema,
  imageSearchSchema,
  photoshootSchema,
  productGalleryImageSchema,
  productIdsQuerySchema,
  productsQuerySchema,
  setFeaturedSchema,
  updateProductSchema,
} from './products.schema.js'
import {
  addCompanyProductImage,
  createProduct,
  customizeBox,
  customizeProduct,
  deleteProduct,
  getProductById,
  getProductsByIds,
  getRelatedProducts,
  listProducts,
  listSupplies,
  runProductPhotoshoot,
  searchByImage,
  setProductsFeatured,
  updateProduct,
} from './products.service.js'
import { isUniqueViolation, publicErrorMessage } from '../../lib/dbErrors.js'

function firstZodError(error: import('zod').ZodError): string {
  const { fieldErrors, formErrors } = error.flatten()
  const field = Object.values(fieldErrors).flat().find(Boolean)
  return field ?? formErrors[0] ?? 'Invalid request'
}

export const productsRouter = Router()

// Attach the caller's company (if signed in) so read paths overlay only that
// company's branded product images. Guests get the default catalog images.
productsRouter.use(optionalAuth)

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
    const result = await searchByImage({
      ...rest,
      imageBase64: image,
      companyId: req.authUser?.companyId ?? undefined,
    })
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

  const result = await listProducts({
    ...parsed.data,
    companyId: req.authUser?.companyId ?? undefined,
  })
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
    if (isUniqueViolation(err, 'products_sku_idx')) {
      return res.status(409).json({
        error: `${parsed.data.sku ? `SKU ${parsed.data.sku}` : 'That SKU'} is already used by another product. Choose a different one.`,
        field: 'sku',
      })
    }
    console.warn('[products] create failed:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: publicErrorMessage(err, 'Failed to create product') })
  }
})

// Bulk featured toggle. Featured is global — it orders every company's shop and
// picks what gets auto-branded at onboarding — so only a super admin may flip
// it. Registered before `/:id` so the literal segment isn't captured as an id.
productsRouter.patch(
  '/featured',
  requireAuth,
  requireCapability('manage_all'),
  async (req, res) => {
    const parsed = setFeaturedSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) })
    }

    try {
      const updated = await setProductsFeatured(
        parsed.data.ids,
        parsed.data.isFeatured,
      )
      res.json({ updated, isFeatured: parsed.data.isFeatured })
    } catch (err) {
      console.warn(
        '[products] featured update failed:',
        err instanceof Error ? err.message : err,
      )
      res
        .status(500)
        .json({ error: publicErrorMessage(err, 'Failed to update featured products') })
    }
  },
)

productsRouter.patch('/:id', async (req, res) => {
  const parsed = updateProductSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }

  try {
    const product = await updateProduct(
      req.params.id,
      parsed.data,
      req.authUser?.companyId ?? undefined,
    )
    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }
    res.json(product)
  } catch (err) {
    if (isUniqueViolation(err, 'products_sku_idx')) {
      return res.status(409).json({
        error: `${parsed.data.sku ? `SKU ${parsed.data.sku}` : 'That SKU'} is already used by another product. Choose a different one.`,
        field: 'sku',
      })
    }
    console.warn('[products] update failed:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: publicErrorMessage(err, 'Failed to update product') })
  }
})

/**
 * Keep a confirmed design in this company's own gallery for the product.
 *
 * Company-scoped, so it never touches the global catalog row — see
 * `addCompanyProductImage`. Signing in is what supplies the company, so a guest
 * gets a 401 and the client falls back to keeping the design locally.
 */
productsRouter.post('/:id/images', async (req, res) => {
  const companyId = req.authUser?.companyId
  if (!companyId) {
    // 401 only when nobody is signed in. A signed-in user with no company is
    // authenticated but cannot own a company image — that is a 403, and the
    // distinction matters: the client treats 401 as "your token is dead",
    // clears it and bounces to the sign-in screen. Answering 401 here signed
    // people out mid-flow over a save they were told was optional.
    const status = req.authUser ? 403 : 401
    return res
      .status(status)
      .json({ error: 'Sign in with a company account to save designs' })
  }

  const parsed = productGalleryImageSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }

  try {
    await addCompanyProductImage({
      companyId,
      productId: req.params.id,
      imageUrl: parsed.data.imageUrl,
      prompt: parsed.data.prompt ?? null,
    })
    res.status(201).json({ ok: true })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to save the design'
    console.warn('[products] gallery save failed:', message)
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

    // Persist the generated image as a pending, shareable design so it survives
    // refresh and shows in the dashboard (never in the shop product response).
    // Best-effort: a persistence failure must not lose the generated image.
    let slug: string | undefined
    try {
      ;({ slug } = await createShare({
        imageUrl: result.url,
        productId: req.params.id,
        prompt: result.prompt,
        // Scope the design to the dashboard user's company so that, once saved,
        // its image shows in the shop ONLY for that company's logged-in users.
        companyId: req.authUser?.companyId ?? undefined,
      }))
    } catch (shareErr) {
      console.warn(
        '[products] photoshoot share persist failed:',
        shareErr instanceof Error ? shareErr.message : shareErr,
      )
    }

    res.json({ ...result, slug })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to generate image'
    const status = message === 'Product not found' ? 404 : 502
    console.warn('[products] photoshoot failed:', message)
    res.status(status).json({ error: message })
  }
})

// Print a shopper's design onto a gift box. Registered before `/:id` routes so
// the literal segment isn't captured as an id.
productsRouter.post('/:id/customize-box', async (req, res) => {
  const parsed = customizeBoxSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }

  try {
    const result = await customizeBox(req.params.id, parsed.data)
    res.json(result)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to customize the box'
    const status =
      message === 'Product not found'
        ? 404
        : message === 'Only packaging can be customized'
          ? 400
          : 502
    console.warn('[products] box customization failed:', message)
    res.status(status).json({ error: message })
  }
})

// Apply a design to any product — what the full-screen design editor calls.
// `/:id/customize-box` stays as the box-only path it always was; this one also
// takes mugs, notebooks and the rest, and picks the right brief per category.
productsRouter.post('/:id/customize', async (req, res) => {
  const parsed = customizeProductSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }

  try {
    res.json(await customizeProduct(req.params.id, parsed.data))
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to apply the design'
    const status = message === 'Product not found' ? 404 : 502
    console.warn('[products] customize failed:', message)
    res.status(status).json({ error: message })
  }
})

// The box builder's boxes and filling materials — the one read that returns
// supply products, which `GET /` and every other shop path filter out.
// Registered before `/:id` so the literal path isn't captured as an id.
productsRouter.get('/supplies', async (req, res) => {
  const companyId = req.authUser?.companyId ?? undefined
  const data = await listSupplies(companyId)
  res.json({ data })
})

// Batch lookup for refreshing client-side product snapshots (the cart) against
// live, company-scoped data. Registered before `/:id` so the literal path isn't
// captured as an id.
productsRouter.get('/by-ids', async (req, res) => {
  const parsed = productIdsQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }
  const companyId = req.authUser?.companyId ?? undefined
  const data = await getProductsByIds(parsed.data.ids, companyId)
  res.json({ data })
})

productsRouter.get('/:id', async (req, res) => {
  const companyId = req.authUser?.companyId ?? undefined
  const product = await getProductById(req.params.id, companyId)
  if (!product) {
    return res.status(404).json({ error: 'Product not found' })
  }
  res.json(product)
})

productsRouter.get('/:id/related', async (req, res) => {
  const companyId = req.authUser?.companyId ?? undefined
  const limit = Math.min(
    Math.max(1, Number(req.query.limit) || 4),
    12,
  )

  const tag =
    typeof req.query.tag === 'string' && req.query.tag.trim()
      ? req.query.tag.trim().slice(0, 64)
      : undefined

  const related = await getRelatedProducts(
    req.params.id,
    limit,
    companyId,
    tag,
  )
  res.json({ data: related })
})
