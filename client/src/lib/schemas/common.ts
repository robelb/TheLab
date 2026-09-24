import { z } from 'zod'
import type { TFunction } from 'i18next'

/**
 * Rules more than one form shares.
 *
 * The limits mirror the API's own Zod schemas (`backend/src/modules/*`), so
 * anything this lets through the server accepts too — a form that passes here
 * and is then refused by the server is the most confusing thing it can do.
 *
 * Storefront schemas take `t` and say everything in the shopper's language;
 * dashboard schemas pass messages in English, like the rest of the dashboard.
 */

/** Digits, spaces and the usual separators; 6–15 digits in all (E.164 max). */
export function isPhoneNumber(value: string): boolean {
  if (!/^\+?[\d\s()./-]+$/.test(value)) return false
  const digits = value.replace(/\D/g, '').length
  return digits >= 6 && digits <= 15
}

/** Today as `YYYY-MM-DD` in the visitor's own time zone, like `<input type="date">`. */
export function todayIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Free mail providers the API refuses at signup (`backend/src/lib/email.ts`).
 * Checked here too, so the reason is given before sending rather than after.
 * Keep in sync — the server stays the authority either way.
 */
const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'ymail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'gmx.de',
  'gmx.net',
  'web.de',
  'mail.com',
  'yandex.com',
  'yandex.ru',
  'zoho.com',
  't-online.de',
])

export function personalEmailDomain(email: string): string | null {
  const domain = email.trim().toLowerCase().split('@')[1]
  return domain && PERSONAL_EMAIL_DOMAINS.has(domain) ? domain : null
}

/** Messages a rule needs — in the shopper's language, or plain English. */
export interface Messages {
  required: string
  invalid: string
  tooLong: (max: number) => string
}

export function requiredText(max: number, messages: Pick<Messages, 'required' | 'tooLong'>) {
  return z.string().trim().min(1, messages.required).max(max, messages.tooLong(max))
}

export function optionalText(max: number, tooLong: (max: number) => string) {
  return z.string().trim().max(max, tooLong(max))
}

export function emailRule(messages: Messages) {
  return z
    .string()
    .trim()
    .min(1, messages.required)
    .max(320, messages.tooLong(320))
    .email(messages.invalid)
}

/** Storefront wording for "too long", shared by every translated schema. */
export function tooLongIn(t: TFunction) {
  return (max: number) => t('validation.tooLong', { max })
}

/** English wording for "too long", for the dashboard. */
export const tooLongEn = (max: number) => `Please keep this under ${max} characters.`
