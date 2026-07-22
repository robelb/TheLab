import { z } from 'zod'
import { normalizeHex } from '../../lib/color.js'

export const PAGE_SIZE_OPTIONS = [20, 40, 60] as const

const optionalPrice = z.coerce
  .number()
  .min(0, 'Price must be 0 or greater')
  .optional()

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
  })
  .refine(
    (data) =>
      data.minPrice === undefined ||
      data.maxPrice === undefined ||
      data.minPrice <= data.maxPrice,
    { message: 'minPrice must be less than or equal to maxPrice' },
  )

export type ProductsQuery = z.infer<typeof productsQuerySchema>

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
})

export type PhotoshootBody = z.infer<typeof photoshootSchema>
