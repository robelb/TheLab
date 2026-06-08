import { z } from 'zod'

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
    q: z
      .string()
      .optional()
      .transform((v) => {
        const trimmed = v?.trim()
        return trimmed ? trimmed : undefined
      }),
    minPrice: optionalPrice,
    maxPrice: optionalPrice,
    domain: z.string().optional(),
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
    domain: z.string().optional(),
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
