import { z } from 'zod'
import type { TFunction } from 'i18next'
import {
  emailRule,
  isPhoneNumber,
  optionalText,
  requiredText,
  todayInBerlin,
  tooLongIn,
} from './common'
import {
  INVOICE_COUNTRIES,
  SHIPPING_COUNTRIES,
  normalizeVatId,
  vatIdLooksValid,
  vatIdPrefix,
  vatIdRequired,
} from '@/lib/shipping'

/**
 * What a request needs before it is worth sending.
 *
 * Stricter than the API in the places where a mistake costs a day: the API
 * takes any postcode because it stores whatever it is given, but an invoice to
 * a German address with a four-digit postcode comes back. The invoice country
 * decides the postcode format, whether a VAT ID is required and what it must
 * start with; the shipping method decides which address questions apply.
 *
 * Built with `t` so every message is in the shopper's language, and with the
 * number of gift boxes in the cart, which mixed shipping is split across;
 * rebuild it when either changes (see CheckoutPage).
 */
export function makeCheckoutSchema(t: TFunction, boxes: number) {
  const tooLong = tooLongIn(t)
  const required = (key: string, max: number) =>
    requiredText(max, { required: t(key), tooLong })
  const street = (key: string) =>
    required(key, 300).refine((v) => /\d/.test(v), t('validation.houseNumber'))
  /** German postcodes are five digits; elsewhere, a plausible short code. */
  const zipProblem = (zip: string, country: string): string | null => {
    if (!zip) return t('validation.zipRequired')
    if (country === 'DE') return /^\d{5}$/.test(zip) ? null : t('validation.zip')
    return /^[A-Z0-9][A-Z0-9 -]{1,9}$/i.test(zip) ? null : t('validation.zipForeign')
  }

  const details = z.object({
    firstName: required('validation.firstName', 100),
    lastName: required('validation.lastName', 100),
    email: emailRule({
      required: t('validation.emailRequired'),
      invalid: t('validation.email'),
      tooLong,
    }),
    phone: z
      .string()
      .trim()
      .min(1, t('validation.phoneRequired'))
      .max(40, tooLong(40))
      .refine(isPhoneNumber, t('validation.phone')),
    position: optionalText(120, tooLong),
    company: required('validation.company', 200),
    street: street('validation.street'),
    line2: optionalText(300, tooLong),
    city: required('validation.city', 120),
    poNumber: optionalText(64, tooLong),
    neededBy: z
      .string()
      .trim()
      .refine((v) => v === '' || v >= todayInBerlin(), t('validation.neededByPast')),
    notes: optionalText(2000, tooLong),
    privacyAccepted: z.boolean().refine((v) => v, t('checkout.privacyRequired')),
  })

  // Rules that depend on the invoice country. Their own schema, joined with
  // `and`, rather than a refinement on the whole form: Zod runs an object's
  // refinements only once every field has passed, which would hold these
  // errors back until the rest were fixed.
  const invoiceCountry = z
    .object({
      country: z.string().length(2),
      zip: z.string().trim(),
      // Typed with spaces or dots as often as without; stored the way it prints.
      vatId: z.string().transform(normalizeVatId),
    })
    .superRefine((b, ctx) => {
      const issue = (path: string, message: string) =>
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message })
      if (!INVOICE_COUNTRIES.includes(b.country)) {
        issue('country', t('validation.invoiceCountry'))
      }
      const zip = zipProblem(b.zip, b.country)
      if (zip) issue('zip', zip)
      if (vatIdRequired(b.country) && !b.vatId) {
        issue('vatId', t('validation.vatIdRequired'))
      } else if (b.vatId && !vatIdLooksValid(b.country, b.vatId)) {
        issue('vatId', t('validation.vatIdCountry', { prefix: vatIdPrefix(b.country) }))
      }
    })

  // How the boxes travel, and the address questions that follow from it.
  const shipping = z
    .object({
      country: z.string(),
      shippingMethod: z.enum(['bulk', 'individual', 'mixed']),
      bulkBoxes: z.string().trim(),
      sameAsBilling: z.boolean(),
      deliveryStreet: z.string().trim(),
      deliveryLine2: optionalText(300, tooLong),
      deliveryZip: z.string().trim(),
      deliveryCity: z.string().trim(),
      deliveryCountry: z.string().length(2),
    })
    .superRefine((d, ctx) => {
      const issue = (path: string, message: string) =>
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message })
      const check = (field: keyof typeof d, rule: z.ZodTypeAny) => {
        const result = rule.safeParse(d[field])
        if (!result.success) issue(field, result.error.issues[0].message)
      }

      if (d.shippingMethod === 'mixed') {
        const n = Number(d.bulkBoxes)
        if (!Number.isInteger(n) || n < 1 || n >= boxes) {
          issue('bulkBoxes', t('validation.bulkBoxes', { max: boxes - 1 }))
        }
      }
      if (!SHIPPING_COUNTRIES.includes(d.deliveryCountry)) {
        issue('deliveryCountry', t('validation.shipEuOnly'))
      }
      // Individually sent boxes have no delivery address; theirs come later.
      if (d.shippingMethod === 'individual') return
      if (d.sameAsBilling) {
        if (!SHIPPING_COUNTRIES.includes(d.country)) {
          issue('sameAsBilling', t('validation.shipEuOnly'))
        }
        return
      }
      check('deliveryStreet', street('validation.street'))
      const zip = zipProblem(d.deliveryZip, d.deliveryCountry)
      if (zip) issue('deliveryZip', zip)
      check('deliveryCity', required('validation.city', 120))
    })

  return details.and(invoiceCountry).and(shipping)
}

export type CheckoutValues = z.infer<ReturnType<typeof makeCheckoutSchema>>
