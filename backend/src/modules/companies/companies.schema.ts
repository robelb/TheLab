import { z } from 'zod'
import { normalizeDomainInput } from '../extract/extract.schema.js'

export const listCompaniesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z
    .string()
    .optional()
    .transform((v) => {
      const t = v?.trim()
      return t ? t : undefined
    }),
})

export const createCompanySchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  // Reuse the same domain normalization used for brand extraction.
  domain: z
    .string()
    .min(1, 'Domain is required')
    .transform(normalizeDomainInput),
})

export const updateCompanySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    sourceUrl: z.string().trim().url().nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'At least one field must be provided',
  })

/** Shallow-merge partial brand overrides (e.g. tweak colors) into stored brand. */
export const updateBrandSchema = z.object({
  brand: z.record(z.unknown()),
})

export type ListCompaniesQuery = z.infer<typeof listCompaniesQuerySchema>
export type CreateCompanyBody = z.infer<typeof createCompanySchema>
export type UpdateCompanyBody = z.infer<typeof updateCompanySchema>
