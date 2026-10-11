import { z } from 'zod'
import type { TFunction } from 'i18next'
import { emailRule, tooLongIn } from './common'

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
