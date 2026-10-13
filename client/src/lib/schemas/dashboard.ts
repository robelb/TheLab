import { z } from 'zod'
import { ASSIGNABLE_ROLES } from '@/lib/roles'
import { normalizeDomainInput } from '@/lib/domainSchema'
import type { TFunction } from 'i18next'
import { emailRule, optionalText, requiredText, tooLongEn, tooLongIn } from './common'

/**
 * The dashboard's forms. English, like the rest of the dashboard; the limits
 * mirror the API's schemas in `backend/src/modules/*`.
 */

const required = (max: number, message: string) =>
  requiredText(max, { required: message, tooLong: tooLongEn })
const optional = (max: number) => optionalText(max, tooLongEn)

const email = emailRule({
  required: 'Enter their email address.',
  invalid: "This doesn't look like an email address, e.g. name@company.com.",
  tooLong: tooLongEn,
})

/** A person added by someone else: team members, and users an admin creates. */
export const newUserSchema = z.object({
  name: required(200, 'Enter their name.'),
  email,
  password: z
    .string()
    .min(8, 'Use at least 8 characters.')
    .max(200, tooLongEn(200)),
  role: z.enum(ASSIGNABLE_ROLES as [string, ...string[]], {
    errorMap: () => ({ message: 'Choose a role.' }),
  }),
  /** Admin only; empty = no company. */
  companyId: z.string(),
})

const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i

export const newCompanySchema = z.object({
  name: required(200, 'Enter the company name.'),
  domain: z
    .string()
    .trim()
    .min(1, 'Enter the company website, e.g. acme.com.')
    .transform(normalizeDomainInput)
    .refine((d) => domainPattern.test(d), 'Enter a domain like acme.com, without https:// or a path.'),
})

export const companyNameSchema = z.object({
  name: required(200, 'The company needs a name.'),
})

export const newCampaignSchema = z.object({
  title: required(200, 'Give the campaign a name, e.g. Summer essentials.'),
})

/** Mirrors `generateCampaignSchema.brief` (max 1000). Optional by design. */
export const CAMPAIGN_BRIEF_MAX = 1000
export const campaignBriefSchema = z.object({
  brief: optional(CAMPAIGN_BRIEF_MAX),
})

/**
 * What the URL segment will actually be.
 *
 * The server only takes lowercase letters, digits and hyphens. Rather than
 * refusing "Weihnachten 2026", it becomes weihnachten-2026 — the preview line
 * under the field shows the result, so nothing is changed behind anyone's back.
 */
export function toSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * The new-collection form, in the reader's language — built with `t` like
 * `makeProductSchema` below, so a language switch re-words the errors.
 */
export function makeNewCollectionSchema(t: TFunction) {
  const v = (key: string) => t(`dashboard.admin.newCollection.validation.${key}`)
  const tooLong = tooLongIn(t)
  return z.object({
    // Cleaned first, then checked: what is validated is what the URL will be.
    slug: z
      .string()
      .transform(toSlug)
      .pipe(z.string().min(1, v('slugRequired')).max(80, tooLong(80))),
    tag: requiredText(64, { required: v('tagRequired'), tooLong }),
    titleDe: requiredText(200, { required: v('titleDeRequired'), tooLong }),
    titleEn: optionalText(200, tooLong),
    locale: z.enum(['de', 'en']),
  })
}

const numberText = (message: string, check: (n: number) => boolean) =>
  z
    .string()
    .trim()
    .refine((v) => v !== '' && Number.isFinite(Number(v)) && check(Number(v)), message)

/**
 * The product editor's schema, in the reader's language — built per render
 * with `t`, like the storefront's schemas, so switching language re-words the
 * errors already on screen.
 */
export function makeProductSchema(t: TFunction) {
  const v = (key: string) => t(`dashboard.products.validation.${key}`)
  const tooLong = tooLongIn(t)
  const requiredT = (max: number, message: string) =>
    requiredText(max, { required: message, tooLong })
  const optionalT = (max: number) => optionalText(max, tooLong)

  const productFields = z.object({
    name: requiredT(300, v('nameRequired')),
    tagline: optionalT(200),
    price: numberText(v('price'), (n) => n >= 0 && n <= 1_000_000),
    currency: z
      .string()
      .trim()
      .transform((c) => c.toUpperCase())
      .refine((c) => /^[A-Z]{3}$/.test(c), v('currency')),
    stock: numberText(v('stock'), (n) => Number.isInteger(n) && n >= 0),
    categoryId: z.string().min(1, v('category')),
    images: z.array(z.string()).min(1, v('images')),
    description: optionalT(5000),
    details: optionalT(5000),
    isFeatured: z.boolean(),
    active: z.boolean(),
    sku: optionalT(64),
    tags: z.string().refine((value) => {
      const tags = value.split(',').map((tag) => tag.trim()).filter(Boolean)
      return tags.length <= 20 && tags.every((tag) => tag.length <= 64)
    }, v('tags')),
    labels: z.array(z.enum(['vegan', 'organic'])),
    minQuantity: numberText(
      v('minQuantity'),
      (n) => Number.isInteger(n) && n >= 1 && n <= 100_000,
    ),
  })

  // Its own schema, joined with `and`, so this shows together with the other
  // errors — an object refinement would only run once every field had passed.
  const productContents = z
    .object({
      isBundle: z.boolean(),
      contents: z.object({ items: z.array(z.unknown()) }).passthrough(),
    })
    .superRefine((value, ctx) => {
      if (value.isBundle && value.contents.items.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contents'],
          message: v('contents'),
        })
      }
    })

  return productFields.and(productContents)
}
