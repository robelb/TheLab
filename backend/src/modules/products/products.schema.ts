import { z } from 'zod'
import { normalizeHex } from '../../lib/color.js'
import { placementLayoutSchema } from '../../customizer/placementLayout.js'

export const PAGE_SIZE_OPTIONS = [20, 40, 60] as const

const optionalPrice = z.coerce
  .number()
  .min(0, 'Price must be 0 or greater')
  .optional()

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const productsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce
      .number()
      .int()
      .refine(
        (n) =>
          PAGE_SIZE_OPTIONS.includes(n as (typeof PAGE_SIZE_OPTIONS)[number]),
        { message: `limit must be one of: ${PAGE_SIZE_OPTIONS.join(', ')}` },
      )
      .default(20),
    category: z
      .string()
      .optional()
      .transform((v) => (v && v !== 'all' ? v : undefined)),
    // Comma-separated list of category names/slugs for multi-select filtering.
    categories: z
      .string()
      .optional()
      .transform((v) => {
        if (!v) return undefined
        const list = v
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s && s !== 'all')
        return list.length > 0 ? list : undefined
      }),
    q: z
      .string()
      .optional()
      .transform((v) => {
        const trimmed = v?.trim()
        return trimmed ? trimmed : undefined
      }),
    minPrice: optionalPrice,
    maxPrice: optionalPrice,
    // Brand color for similarity sorting; normalized to `#rrggbb`, invalid → undefined.
    brandColor: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? (normalizeHex(v) ?? undefined) : undefined)),
    // Whether featured products stay pinned first under color sort. Defaults to
    // true (initial brand color); the client sends 'false' when the user picks a
    // color to filter by, so results sort purely by color.
    pinFeatured: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v !== 'false'),
    // Box-building supplies (packaging, filling) are hidden from the shop, but
    // the dashboard manages them alongside everything else — it opts in here.
    includeSupplies: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
    // Occasion / use-case slug. A landing page's whole filter is this one
    // parameter, so it is lowercased here and matched exactly.
    tag: z
      .string()
      .trim()
      .max(64)
      .optional()
      .transform((v) => (v ? v.toLowerCase() : undefined)),
    // `bundle` narrows to pre-configured boxes; `single` to ordinary items.
    kind: z.enum(['single', 'bundle']).optional(),
    // Comma-separated category slugs to leave out — a landing page's grid has
    // no use for the cards and stickers that only make sense inside a box.
    // Anything that is not a slug is dropped, not refused.
    excludeCategories: z
      .string()
      .max(1000)
      .optional()
      .transform((v) =>
        v
          ? [
              ...new Set(
                v
                  .split(',')
                  .map((s) => s.trim().toLowerCase())
                  .filter((s) => /^[a-z0-9-]{1,64}$/.test(s)),
              ),
            ].slice(0, 20)
          : undefined,
      ),
    // Comma-separated ids to leave out: a picker's already-chosen products.
    // Filtered here rather than after the fetch, so a page of 20 is 20 the
    // caller can use. Anything that is not a uuid is dropped, not refused.
    exclude: z
      .string()
      .max(8000)
      .optional()
      .transform((v) =>
        v
          ? [
              ...new Set(
                v
                  .split(',')
                  .map((id) => id.trim())
                  .filter((id) => UUID_RE.test(id)),
              ),
            ].slice(0, 200)
          : undefined,
      ),
  })
  .refine(
    (data) =>
      data.minPrice === undefined ||
      data.maxPrice === undefined ||
      data.minPrice <= data.maxPrice,
    { message: 'minPrice must be less than or equal to maxPrice' },
  )

export type ProductsQuery = z.infer<typeof productsQuerySchema>

/** Max ids per batch lookup — well above any realistic cart size. */
const MAX_ID_BATCH = 100

/** Query schema for GET /api/products/by-ids?ids=uuid,uuid — dedupes as it parses. */
export const productIdsQuerySchema = z.object({
  ids: z
    .string()
    .transform((v) => [
      ...new Set(
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ])
    .refine((list) => list.length > 0, { message: 'ids is required' })
    .refine((list) => list.length <= MAX_ID_BATCH, {
      message: `ids must contain at most ${MAX_ID_BATCH} entries`,
    })
    .refine((list) => list.every((id) => z.string().uuid().safeParse(id).success), {
      message: 'ids must be a comma-separated list of UUIDs',
    }),
})

const IMAGE_SEARCH_LIMITS = [10, 20, 40] as const

/**
 * Body schema for POST /api/products/search/image.
 * `image` accepts a raw base64 string or a `data:<mime>;base64,...` data URL —
 * a leading data-URL prefix is stripped and its MIME is preferred over `mimeType`.
 */
export const imageSearchSchema = z
  .object({
    image: z.string().min(1, 'image is required'),
    mimeType: z.string().optional(),
    category: z
      .string()
      .optional()
      .transform((v) => (v && v !== 'all' ? v : undefined)),
    minPrice: optionalPrice,
    maxPrice: optionalPrice,
    limit: z.coerce
      .number()
      .int()
      .refine(
        (n) =>
          IMAGE_SEARCH_LIMITS.includes(n as (typeof IMAGE_SEARCH_LIMITS)[number]),
        { message: `limit must be one of: ${IMAGE_SEARCH_LIMITS.join(', ')}` },
      )
      .default(10),
  })
  .transform((data) => {
    const match = /^data:(?<mime>[^;]+);base64,(?<body>.*)$/s.exec(data.image)
    return {
      ...data,
      image: match?.groups?.body ?? data.image,
      mimeType: match?.groups?.mime ?? data.mimeType ?? 'image/png',
    }
  })
  .refine(
    (data) =>
      data.minPrice === undefined ||
      data.maxPrice === undefined ||
      data.minPrice <= data.maxPrice,
    { message: 'minPrice must be less than or equal to maxPrice' },
  )

export type ImageSearchBody = z.infer<typeof imageSearchSchema>

// ---------------------------------------------------------------------------
// CRUD schemas (dashboard product management)
// ---------------------------------------------------------------------------

/** One line of a bundle's parts list, as the dashboard editor sends it. */
export const productComponentSchema = z.object({
  componentId: z.string().uuid('componentId must be a valid product'),
  quantity: z.coerce.number().int().min(1).max(1000).default(1),
  role: z.enum(['item', 'packaging', 'filling']).default('item'),
  sortOrder: z.coerce.number().int().min(0).max(500).optional(),
})

const productKindField = z.enum(['single', 'bundle'])
const productTagsField = z.array(z.string().trim().min(1).max(64)).max(20)
const minQuantityField = z.coerce.number().int().min(1).max(100_000)

export const createProductSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  tagline: z.string().trim().optional().default(''),
  price: z.coerce.number().min(0, 'price must be 0 or greater'),
  currency: z.string().trim().min(1).default('EUR'),
  stock: z.coerce.number().int().min(0, 'stock must be 0 or greater').default(0),
  categoryId: z.string().uuid('categoryId must be a valid category'),
  image: z.string().trim().min(1, 'image is required'),
  images: z.array(z.string().trim().min(1)).optional(),
  description: z.string().trim().optional().default(''),
  details: z.array(z.string()).optional().default([]),
  isFeatured: z.boolean().optional().default(false),
  sku: z.string().trim().optional(),
  sourceId: z.string().trim().optional().default('manual'),
  variantId: z.string().trim().optional(),
  kind: productKindField.optional(),
  tags: productTagsField.optional(),
  minQuantity: minQuantityField.optional(),
  /** The parts list, when this product is a pre-configured box. */
  components: z.array(productComponentSchema).max(50).optional(),
})

export type CreateProductBody = z.infer<typeof createProductSchema>

// All fields optional for partial updates; at least one must be present.
export const updateProductSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    tagline: z.string().trim().optional(),
    price: z.coerce.number().min(0).optional(),
    currency: z.string().trim().min(1).optional(),
    stock: z.coerce.number().int().min(0).optional(),
    categoryId: z.string().uuid().optional(),
    image: z.string().trim().min(1).optional(),
    images: z.array(z.string().trim().min(1)).optional(),
    description: z.string().trim().optional(),
    details: z.array(z.string()).optional(),
    isFeatured: z.boolean().optional(),
    sku: z.string().trim().optional(),
    variantId: z.string().trim().optional(),
    kind: productKindField.optional(),
    tags: productTagsField.optional(),
    minQuantity: minQuantityField.optional(),
    components: z.array(productComponentSchema).max(50).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })

export type UpdateProductBody = z.infer<typeof updateProductSchema>

// ---------------------------------------------------------------------------
// AI product photoshoot (3-image system: style + product + branding)
// ---------------------------------------------------------------------------

export const photoshootSchema = z.object({
  sceneType: z.string().trim().min(1).default('studio-hero'),
  /** Output aspect ratio: square | portrait | landscape. */
  aspectRatio: z.string().trim().min(1).default('square'),
  /** Image B — the product reference (a URL of one of the product's images). */
  productImageUrl: z.string().trim().min(1, 'productImageUrl is required'),
  /** Iterative refinement: a previously generated image URL to edit further. */
  baseImageUrl: z.string().trim().min(1).optional(),
  /** Optional extra direction typed by the user. */
  prompt: z.string().trim().max(2000).optional(),
  /** Image A — style reference (data URL / base64), optional. */
  styleImage: z.string().min(1).optional(),
  /** Image C — branding reference. Defaults to the company logo, supplied as
   *  one of: a data URL/base64 upload, a remote URL, or inline SVG markup. */
  brandingImage: z.string().min(1).optional(),
  brandingImageUrl: z.string().trim().min(1).optional(),
  brandingSvg: z.string().min(1).optional(),
  /** Where the user dragged the branding. Takes the edit-base slot when set. */
  layout: placementLayoutSchema.optional(),
})

export type PhotoshootBody = z.infer<typeof photoshootSchema>

// ---------------------------------------------------------------------------
// Box customization — print a shopper's design onto a packaging supply
// ---------------------------------------------------------------------------

export const customizeBoxSchema = z
  .object({
    /**
     * What the shopper wants printed, in their own words. Optional: adding or
     * dropping the logo is a complete instruction on its own, as is asking to
     * change a design that already exists.
     */
    prompt: z.string().trim().max(2000).optional().default(''),
    /**
     * For a stock-colour box (Eco Box, Magnetbox), which board colour it is
     * supplied in. For a full-colour box, the colour to print the whole box.
     */
    color: z.string().trim().max(40).optional(),
    /** Which of the box's images to print onto; defaults to its cover. */
    boxImageUrl: z.string().trim().min(1).optional(),
    /** A previous render to iterate on, so tweaks build on each other. */
    baseImageUrl: z.string().trim().min(1).optional(),
    /** Optional logo to apply alongside the design (data URL / URL / inline SVG). */
    brandingImage: z.string().min(1).optional(),
    brandingImageUrl: z.string().trim().min(1).optional(),
    brandingSvg: z.string().min(1).optional(),
    /**
     * Where the shopper dragged the logo and any wording. Takes the edit-base
     * slot from `baseImageUrl` when set.
     */
    layout: placementLayoutSchema.optional(),
  })
  .refine(
    (v) =>
      Boolean(
        v.prompt ||
          v.brandingImage ||
          v.brandingImageUrl ||
          v.brandingSvg ||
          v.baseImageUrl ||
          v.layout?.layers.length,
      ),
    { message: 'Describe what to print, or include your logo' },
  )

export type CustomizeBoxBody = z.infer<typeof customizeBoxSchema>

// ---------------------------------------------------------------------------
// Customizing any product — the box builder's design editor
// ---------------------------------------------------------------------------

/**
 * One request for every subject the design editor can open.
 *
 * A box and a mug need genuinely different briefs — a box has stock colours and
 * printable faces, a mug has a scene and an aspect ratio — so the fields for
 * both live here and the service dispatches on the product's category. The
 * alternative, two endpoints the client picks between, pushes that same
 * dispatch into the browser where it would drift.
 */
export const customizeProductSchema = z
  .object({
    prompt: z.string().trim().max(2000).optional().default(''),
    /** A previous render to iterate on, so tweaks build on each other. */
    baseImageUrl: z.string().trim().min(1).optional(),
    /** Where the user placed the logo and any wording. */
    layout: placementLayoutSchema.optional(),
    brandingImage: z.string().min(1).optional(),
    brandingImageUrl: z.string().trim().min(1).optional(),
    brandingSvg: z.string().min(1).optional(),
    // ── packaging only
    color: z.string().trim().max(40).optional(),
    // ── everything else
    sceneType: z.string().trim().min(1).optional(),
    aspectRatio: z.string().trim().min(1).optional(),
    /** Which of the product's images to work from; defaults to its cover. */
    productImageUrl: z.string().trim().min(1).optional(),
  })
  .refine(
    (v) =>
      Boolean(
        v.prompt ||
          v.brandingImage ||
          v.brandingImageUrl ||
          v.brandingSvg ||
          v.baseImageUrl ||
          v.layout?.layers.length,
      ),
    { message: 'Describe what to print, or include your logo' },
  )

export type CustomizeProductBody = z.infer<typeof customizeProductSchema>

// ---------------------------------------------------------------------------
// Company gallery — a confirmed design kept as one of this company's own
// images for a product.
// ---------------------------------------------------------------------------

export const productGalleryImageSchema = z.object({
  imageUrl: z.string().trim().min(1).max(2048),
  prompt: z.string().trim().max(4000).optional(),
})

export type ProductGalleryImageBody = z.infer<typeof productGalleryImageSchema>
