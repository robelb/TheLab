import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

config({ path: path.resolve(__dirname, '../../.env') })

const isProduction = process.env.NODE_ENV === 'production'

/**
 * The key every login token is signed with. Locally a placeholder will do;
 * in production a missing or short one would let anyone forge a token — a
 * super admin's included — so the server refuses to start instead.
 */
function jwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim()
  if (isProduction && (!secret || secret.length < 32)) {
    throw new Error(
      'JWT_SECRET must be set to a random value of at least 32 characters in production ' +
        '(e.g. `openssl rand -base64 48`).',
    )
  }
  return secret || 'dev-insecure-secret-change-me'
}

/**
 * Where the shop — and its dashboard — is reached, for links in emails.
 *
 * Locally it is the Vite dev server unless set. In production it must be set
 * to the real https address: without it every "Open in dashboard" link would
 * point at localhost, and the API would only accept calls from there (see
 * `corsOrigins`), so the server refuses to start instead.
 */
function publicShopUrl(): string {
  const configured = process.env.PUBLIC_SHOP_URL?.trim().replace(/\/+$/, '')
  if (!isProduction) return configured || 'http://localhost:5173'
  let url: URL | null = null
  try {
    url = configured ? new URL(configured) : null
  } catch {
    url = null
  }
  const local = url && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname)
  if (!url || url.protocol !== 'https:' || local) {
    throw new Error(
      'PUBLIC_SHOP_URL must be set to the shop\'s public https address in production ' +
        '(e.g. https://thelab-001.web.app) — email links and CORS are built from it.',
    )
  }
  return configured!
}

export const IS_PRODUCTION = isProduction

/**
 * The API's own public address, for links to files it serves itself. Locally
 * the dev server; in production it must be the real https address — it is
 * also the one origin the fetch guard (`lib/safeFetch.ts`) trusts.
 */
function publicApiUrl(): string {
  const configured = process.env.PUBLIC_API_URL?.trim().replace(/\/+$/, '')
  if (!isProduction) return configured || 'http://localhost:3001'
  let url: URL | null = null
  try {
    url = configured ? new URL(configured) : null
  } catch {
    url = null
  }
  if (!url || url.protocol !== 'https:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname)) {
    throw new Error(
      "PUBLIC_API_URL must be set to the API's public https address in production " +
        '(e.g. https://api.biglittlethings.de).',
    )
  }
  return configured!
}

/**
 * Where uploaded and generated images go. On a container host the local disk
 * is wiped on every restart and is not shared between instances, so production
 * refuses to start without real storage rather than lose customers' logos.
 */
function requireStorageInProduction(): void {
  if (!isProduction) return
  if (!process.env.SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error(
      'Image storage is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. ' +
        'Without them uploads would go to the container disk and disappear.',
    )
  }
}
requireStorageInProduction()

/** A number from the environment, or the default when unset or blank. */
function numberOr(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number, not "${raw}".`)
  return value
}

export const env = {
  PORT: Number(process.env.PORT) || 3001,
  DATABASE_URL: process.env.DATABASE_URL ?? '',

  OPENAI_API_KEY: process.env.OPENAI_API_KEY?.trim() ?? '',
  OPENAI_MODEL: process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
  OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1',
  OPENAI_EMBEDDING_MODEL:
    process.env.OPENAI_EMBEDDING_MODEL?.trim() || 'text-embedding-3-small',

  GEMINI_API_KEY: process.env.GEMINI_API_KEY?.trim() ?? '',
  GEMINI_MODEL: process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash',
  GEMINI_IMAGE_MODEL:
    process.env.GEMINI_IMAGE_MODEL?.trim() ||
    'gemini-2.0-flash-preview-image-generation',
  /**
   * Resolution Gemini renders at: `1K`, `2K` or `4K`.
   *
   * The API defaults to `1K` when unset, which is why every render came back
   * 1024² however good the prompt was. `2K` is the default here because these
   * images are product photography people zoom into — a printed logo has to
   * survive being looked at closely. Raise to `4K` for print artwork; drop to
   * `1K` if latency or spend matters more than detail.
   */
  GEMINI_IMAGE_SIZE: process.env.GEMINI_IMAGE_SIZE?.trim() || '2K',
  /**
   * Render quality for OpenAI's `images.edit`: `low`, `medium`, `high` or
   * `auto`. This was pinned to `low` in code — the cheapest tier, and a
   * ceiling no prompt could lift.
   */
  OPENAI_IMAGE_QUALITY: process.env.OPENAI_IMAGE_QUALITY?.trim() || 'high',

  PUBLIC_API_URL: publicApiUrl(),

  // Auth (JWT bearer tokens).
  JWT_SECRET: jwtSecret(),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN?.trim() || '7d',
  /**
   * The passwordless "demo" login. Off unless explicitly turned on — it signs
   * whoever asks in as a company owner, so it belongs on a staging setup at
   * most, never on the live shop.
   */
  DEMO_LOGIN_ENABLED: process.env.DEMO_LOGIN_ENABLED?.trim() === 'true',
  /**
   * How many proxies sit in front of the API (Render, Cloud Run: 1). Lets
   * `req.ip` be the visitor's own address, which the rate limits count by;
   * without it every visitor shares the proxy's. 0 locally, where a client
   * could otherwise fake its address in X-Forwarded-For.
   */
  TRUST_PROXY_HOPS:
    process.env.TRUST_PROXY_HOPS !== undefined
      ? Number(process.env.TRUST_PROXY_HOPS) || 0
      : isProduction
        ? 1
        : 0,
  // Consumer email domains that may not create/join a company (comma-separated,
  // extends the built-in list). Signups from these are rejected.
  CONSUMER_EMAIL_DOMAINS: process.env.CONSUMER_EMAIL_DOMAINS?.trim() ?? '',

  // Lead intake — the marketing side's webhook for campaign optimisation.
  // Leave LEAD_INTAKE_URL blank to keep the queue dormant: events are still
  // recorded, nothing is sent.
  LEAD_INTAKE_URL: process.env.LEAD_INTAKE_URL?.trim() ?? '',
  LEAD_INTAKE_TOKEN: process.env.LEAD_INTAKE_TOKEN?.trim() ?? '',
  LEAD_INTAKE_TIMEOUT_MS: Number(process.env.LEAD_INTAKE_TIMEOUT_MS) || 10_000,

  // Email via SMTP (Nodemailer) when SMTP_HOST is set — any mailbox, e.g. a
  // personal Gmail with an app password, sending to anyone without a verified
  // domain. Otherwise via Resend. Leave both blank to keep emails queued in
  // `outbound_events` without sending; configuring one later sends the backlog.
  SMTP_HOST: process.env.SMTP_HOST?.trim() ?? '',
  SMTP_PORT: Number(process.env.SMTP_PORT) || 465,
  // Implicit TLS (465). Port 587 upgrades with STARTTLS instead, so defaults off there.
  SMTP_SECURE: process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE.trim() === 'true'
    : (Number(process.env.SMTP_PORT) || 465) === 465,
  SMTP_USER: process.env.SMTP_USER?.trim() ?? '',
  SMTP_PASS: process.env.SMTP_PASS?.trim() ?? '',
  RESEND_API_KEY: process.env.RESEND_API_KEY?.trim() ?? '',
  MAIL_FROM:
    process.env.MAIL_FROM?.trim() || 'big little things <bestellung@biglittlethings.de>',
  MAIL_REPLY_TO: process.env.MAIL_REPLY_TO?.trim() ?? '',
  // Internal inbox told about every new request. Comma-separated; blank = none.
  ORDER_NOTIFY_EMAIL: process.env.ORDER_NOTIFY_EMAIL?.trim() ?? '',
  // Most box/bundle photos per day per server, as a backstop on the AI bill.
  AI_DAILY_IMAGE_LIMIT: Number(process.env.AI_DAILY_IMAGE_LIMIT) || 500,
  // Lets Cloud Scheduler drain the email queue — see modules/internal. Blank = off.
  OUTBOX_FLUSH_TOKEN: process.env.OUTBOX_FLUSH_TOKEN?.trim() ?? '',
  // Where the shop and dashboard live, for links in emails.
  PUBLIC_SHOP_URL: publicShopUrl(),

  // Invoicing — see src/config/seller.ts for what each one prints as.
  // Blank is not 0 % — that would invoice German customers without VAT.
  VAT_RATE: numberOr('VAT_RATE', 19),
  PAYMENT_TERM_DAYS: Number(process.env.PAYMENT_TERM_DAYS) || 14,
  INVOICE_NUMBER_PREFIX: process.env.INVOICE_NUMBER_PREFIX?.trim() || 'RE',
  // Our public company details (Impressum) as defaults, so every deploy prints
  // the real ones; set the variable to override. Bank details have no default.
  SELLER_NAME: process.env.SELLER_NAME?.trim() || 'big little things GmbH',
  SELLER_STREET: process.env.SELLER_STREET?.trim() || 'Georg-Brauchle-Ring 50',
  SELLER_ZIP: process.env.SELLER_ZIP?.trim() || '80992',
  SELLER_CITY: process.env.SELLER_CITY?.trim() || 'München',
  SELLER_COUNTRY: process.env.SELLER_COUNTRY?.trim() || 'Deutschland',
  SELLER_EMAIL: process.env.SELLER_EMAIL?.trim() || 'hello@biglittlethings.de',
  SELLER_PHONE: process.env.SELLER_PHONE?.trim() || '+49 89 6282 8155',
  SELLER_WEBSITE: process.env.SELLER_WEBSITE?.trim() || 'biglittlethings.de',
  SELLER_VAT_ID: process.env.SELLER_VAT_ID?.trim() || 'DE343143433',
  SELLER_TAX_NUMBER: process.env.SELLER_TAX_NUMBER?.trim() ?? '',
  SELLER_REGISTER_COURT: process.env.SELLER_REGISTER_COURT?.trim() || 'Amtsgericht München',
  SELLER_REGISTER_NUMBER: process.env.SELLER_REGISTER_NUMBER?.trim() || 'HRB 265312',
  SELLER_MANAGING_DIRECTORS:
    process.env.SELLER_MANAGING_DIRECTORS?.trim() || 'Hannes Brellochs, Christoph Martin Quitz',
  SELLER_BANK_NAME: process.env.SELLER_BANK_NAME?.trim() ?? '',
  SELLER_IBAN: process.env.SELLER_IBAN?.trim() ?? '',
  SELLER_BIC: process.env.SELLER_BIC?.trim() ?? '',

  // PostHog — what only the server sees: a request's life after the shopper
  // has gone (quoted, confirmed, paid, cancelled). The same project token the
  // client uses. Blank = nothing is sent.
  POSTHOG_PROJECT_TOKEN: process.env.POSTHOG_PROJECT_TOKEN?.trim() ?? '',
  POSTHOG_HOST: process.env.POSTHOG_HOST?.trim() || 'https://eu.i.posthog.com',

  // Supabase Storage — when configured, uploaded/generated images are stored
  // there instead of on local disk. Leave blank to keep local storage.
  SUPABASE_URL: process.env.SUPABASE_URL?.trim() ?? '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '',
  SUPABASE_STORAGE_BUCKET:
    process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'product-images',
} as const

/** A dashboard page on this environment's shop, e.g. `dashboardUrl('/orders/<id>')`. */
export function dashboardUrl(path = ''): string {
  return `${env.PUBLIC_SHOP_URL}/dashboard${path}`
}
