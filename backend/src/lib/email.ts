import { env } from '../config/env.js'

/** Common consumer/free email providers that may not create or join a company. */
const BUILT_IN_CONSUMER_DOMAINS = new Set([
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

function extraConsumerDomains(): Set<string> {
  return new Set(
    env.CONSUMER_EMAIL_DOMAINS.split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Returns the domain part of an email (lowercased), or null if malformed. */
export function emailDomainOf(email: string): string | null {
  const normalized = normalizeEmail(email)
  const at = normalized.lastIndexOf('@')
  if (at <= 0 || at === normalized.length - 1) return null
  return normalized.slice(at + 1)
}

export function isConsumerEmailDomain(domain: string): boolean {
  const d = domain.trim().toLowerCase()
  return BUILT_IN_CONSUMER_DOMAINS.has(d) || extraConsumerDomains().has(d)
}
