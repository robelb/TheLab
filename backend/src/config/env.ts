import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

config({ path: path.resolve(__dirname, '../../.env') })

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
  GEMINI_IMAGE_SIZE: process.env.GEMINI_IMAGE_SIZE?.trim() || 'low',
  /**
   * Render quality for OpenAI's `images.edit`: `low`, `medium`, `high` or
   * `auto`. This was pinned to `low` in code — the cheapest tier, and a
   * ceiling no prompt could lift.
   */
  OPENAI_IMAGE_QUALITY: process.env.OPENAI_IMAGE_QUALITY?.trim() || 'high',

  PUBLIC_API_URL:
    process.env.PUBLIC_API_URL?.trim() || 'http://localhost:3001',

  // Auth (JWT bearer tokens).
  JWT_SECRET:
    process.env.JWT_SECRET?.trim() || 'dev-insecure-secret-change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN?.trim() || '7d',
  // Consumer email domains that may not create/join a company (comma-separated,
  // extends the built-in list). Signups from these are rejected.
  CONSUMER_EMAIL_DOMAINS: process.env.CONSUMER_EMAIL_DOMAINS?.trim() ?? '',

  // Lead intake — the marketing side's webhook for campaign optimisation.
  // Leave LEAD_INTAKE_URL blank to keep the queue dormant: events are still
  // recorded, nothing is sent.
  LEAD_INTAKE_URL: process.env.LEAD_INTAKE_URL?.trim() ?? '',
  LEAD_INTAKE_TOKEN: process.env.LEAD_INTAKE_TOKEN?.trim() ?? '',
  LEAD_INTAKE_TIMEOUT_MS: Number(process.env.LEAD_INTAKE_TIMEOUT_MS) || 10_000,

  // Supabase Storage — when configured, uploaded/generated images are stored
  // there instead of on local disk. Leave blank to keep local storage.
  SUPABASE_URL: process.env.SUPABASE_URL?.trim() ?? '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '',
  SUPABASE_STORAGE_BUCKET:
    process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'product-images',
} as const
