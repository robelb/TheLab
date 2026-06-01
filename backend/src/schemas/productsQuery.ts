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
        (n) => PAGE_SIZE_OPTIONS.includes(n as (typeof PAGE_SIZE_OPTIONS)[number]),
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
  })
  .refine(
    (data) =>
      data.minPrice === undefined ||
      data.maxPrice === undefined ||
      data.minPrice <= data.maxPrice,
    { message: 'minPrice must be less than or equal to maxPrice' },
  )

export type ProductsQuery = z.infer<typeof productsQuerySchema>
