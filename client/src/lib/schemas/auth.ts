import { z } from 'zod'
import type { TFunction } from 'i18next'
import { emailRule, personalEmailDomain, requiredText, tooLongIn } from './common'

/** Mirrors `backend/src/modules/auth/auth.schema.ts`. */

function email(t: TFunction) {
  return emailRule({
    required: t('validation.emailRequired'),
    invalid: t('validation.email'),
    tooLong: tooLongIn(t),
  })
}

export function makeLoginSchema(t: TFunction) {
  return z.object({
    email: email(t),
    password: z.string().min(1, t('validation.passwordRequired')),
  })
}

export function makeSignupSchema(t: TFunction) {
  return z.object({
    name: requiredText(200, { required: t('validation.name'), tooLong: tooLongIn(t) }),
    // The API refuses free mail providers because a company — and its brand —
    // is set up from the email's domain. Said here, with the reason, before
    // they have waited for a request to fail.
    email: email(t).superRefine((value, ctx) => {
      const domain = personalEmailDomain(value)
      if (domain) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('validation.workEmail', { domain }),
        })
      }
    }),
    password: z.string().min(8, t('validation.passwordShort')).max(200, tooLongIn(t)(200)),
  })
}
