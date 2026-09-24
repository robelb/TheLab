import { z } from 'zod'
import type { TFunction } from 'i18next'
import {
  emailRule,
  isPhoneNumber,
  optionalText,
  requiredText,
  todayIso,
  tooLongIn,
} from './common'

/**
 * What a request needs before it is worth sending.
 *
 * Stricter than the API in the places where a mistake costs a day: the API
 * takes any postcode because it stores whatever it is given, but an invoice to
 * a German address with a four-digit postcode comes back. Everything is Germany
 * only, like the form itself.
 *
 * Built with `t` so every message is in the shopper's language; rebuild it when
 * the language changes (see `useCheckoutSchema` in CheckoutPage).
 */
export function makeCheckoutSchema(t: TFunction) {
  const tooLong = tooLongIn(t)
  const required = (key: string, max: number) =>
    requiredText(max, { required: t(key), tooLong })
  const street = (key: string) =>
    required(key, 300).refine((v) => /\d/.test(v), t('validation.houseNumber'))
  const zip = z
    .string()
    .trim()
    .min(1, t('validation.zipRequired'))
    .regex(/^\d{5}$/, t('validation.zip'))

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
    zip,
    city: required('validation.city', 120),
    country: z.string().length(2),
    // Typed with spaces or dots as often as without; stored the way it prints.
    vatId: z
      .string()
      .transform((v) => v.replace(/[\s.-]/g, '').toUpperCase())
      .refine((v) => v === '' || /^DE\d{9}$/.test(v), t('validation.vatId')),
    poNumber: optionalText(64, tooLong),
    neededBy: z
      .string()
      .trim()
      .refine((v) => v === '' || v >= todayIso(), t('validation.neededByPast')),
    notes: optionalText(2000, tooLong),
    privacyAccepted: z.boolean().refine((v) => v, t('checkout.privacyRequired')),
  })

  // Only asked for when it ships somewhere other than the billing address.
  // Its own schema, joined with `and`, rather than a refinement on the whole
  // form: Zod runs an object's refinements only once every field has passed,
  // which would hold these errors back until the rest were fixed.
  const delivery = z
    .object({
      sameAsBilling: z.boolean(),
      deliveryStreet: z.string().trim(),
      deliveryLine2: optionalText(300, tooLong),
      deliveryZip: z.string().trim(),
      deliveryCity: z.string().trim(),
    })
    .superRefine((d, ctx) => {
      if (d.sameAsBilling) return
      const check = (field: keyof typeof d, rule: z.ZodTypeAny) => {
        const result = rule.safeParse(d[field])
        if (!result.success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: result.error.issues[0].message,
          })
        }
      }
      check('deliveryStreet', street('validation.street'))
      check('deliveryZip', zip)
      check('deliveryCity', required('validation.city', 120))
    })

  return details.and(delivery)
}

export type CheckoutValues = z.infer<ReturnType<typeof makeCheckoutSchema>>
