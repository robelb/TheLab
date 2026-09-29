import nodemailer, { type Transporter } from 'nodemailer'
import { Resend } from 'resend'
import { env } from '../config/env.js'
import type { OutboundEvent, OutboundEventKind } from '../db/schema/index.js'
import type { RenderedEmail } from '../emails/layout.js'
import {
  enqueue,
  registerOutboxHandler,
  sendNow,
  type DeliveryResult,
  type SendOutcome,
} from './outbox.js'

/**
 * Customer and team email, sent via the outbox — over SMTP when `SMTP_HOST` is
 * set, through Resend otherwise.
 *
 * SMTP is there so any mailbox can send (a personal Gmail with an app
 * password, for testing) without verifying a domain with Resend, which only
 * delivers to its own account holder until one is.
 *
 * An email is queued as a kind plus the ids it is about — never its rendered
 * body. It is rendered when it is sent, from the row as it is then, so a retry
 * an hour later does not send a stale copy, and the queue holds no personal
 * data beyond what the order row already does.
 *
 * Rendering is registered per kind by whoever owns the data (the orders module),
 * which keeps this file free of any knowledge of orders — and free of the
 * import cycle that knowledge would create.
 */

export type EmailKind = Extract<OutboundEventKind, `email.${string}`>

export interface BuiltEmail {
  to: string[]
  email: RenderedEmail
  replyTo?: string | null
  attachments?: { filename: string; content: Buffer; contentType?: string }[]
}

/**
 * Turns a queued payload into a message. Null means there is nothing to send
 * any more (the order was deleted, nobody is set to receive it) — the event is
 * then closed as sent rather than retried forever.
 */
export type EmailBuilder = (
  payload: Record<string, unknown>,
) => Promise<BuiltEmail | null>

const builders = new Map<EmailKind, EmailBuilder>()

export function registerEmailBuilder(kind: EmailKind, builder: EmailBuilder): void {
  builders.set(kind, builder)
}

function usesSmtp(): boolean {
  return Boolean(env.SMTP_HOST)
}

export function isMailerConfigured(): boolean {
  return usesSmtp()
    ? Boolean(env.SMTP_USER && env.SMTP_PASS)
    : Boolean(env.RESEND_API_KEY)
}

/**
 * Who the email is from.
 *
 * A mailbox's SMTP server sends only as that mailbox — Gmail rewrites any
 * other From, and others refuse it — so over SMTP the name from `MAIL_FROM` is
 * kept and the address is the account's own.
 */
function fromAddress(): string {
  if (!usesSmtp()) return env.MAIL_FROM
  const match = env.MAIL_FROM.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  const address = match ? match[2] : env.MAIL_FROM.trim()
  if (address.toLowerCase() === env.SMTP_USER.toLowerCase()) return env.MAIL_FROM
  const name = match?.[1]?.trim()
  return name ? `"${name.replace(/"/g, '')}" <${env.SMTP_USER}>` : env.SMTP_USER
}

/** Queue an email. Never throws; never waits on the mail server. */
export async function enqueueEmail(
  kind: EmailKind,
  payload: Record<string, unknown>,
): Promise<void> {
  await enqueue('email', kind, payload)
}

/**
 * Queue an email and send it straight away, answering with what happened —
 * for a person who clicked "send" and should hear if it did not go.
 */
export async function sendEmailNow(
  kind: EmailKind,
  payload: Record<string, unknown>,
): Promise<SendOutcome> {
  const id = await enqueue('email', kind, payload, { flush: false })
  if (!id) return { status: 'failed', error: 'Could not queue the email', willRetry: false }
  return sendNow('email', id)
}

let client: Resend | null = null

function resend(): Resend {
  client ??= new Resend(env.RESEND_API_KEY)
  return client
}

let transporter: Transporter | null = null

function smtp(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  })
  return transporter
}

async function deliver(event: OutboundEvent): Promise<DeliveryResult> {
  const builder = builders.get(event.kind as EmailKind)
  if (!builder) {
    return { ok: false, error: `No email builder for ${event.kind}`, retryable: false }
  }

  const built = await builder(event.payload)
  if (!built || built.to.length === 0) return { ok: true }

  const replyTo = built.replyTo || env.MAIL_REPLY_TO || undefined
  return usesSmtp()
    ? deliverSmtp(event, built, replyTo)
    : deliverResend(event, built, replyTo)
}

async function deliverSmtp(
  event: OutboundEvent,
  built: BuiltEmail,
  replyTo: string | undefined,
): Promise<DeliveryResult> {
  try {
    await smtp().sendMail({
      from: fromAddress(),
      to: built.to,
      subject: built.email.subject,
      html: built.email.html,
      text: built.email.text,
      ...(replyTo ? { replyTo } : {}),
      ...(built.attachments?.length ? { attachments: built.attachments } : {}),
      // SMTP has no idempotency key. A stable Message-ID at least lets the
      // receiving side fold a retried copy into the first one.
      messageId: `<${event.id}@thelab.outbox>`,
    })
    return { ok: true }
  } catch (err) {
    const e = err as { code?: string; responseCode?: number; message?: string }
    // Wrong login or a refused address fails the same way next time; a
    // dropped connection or a 4xx "try later" does not.
    if (e.code === 'EAUTH') {
      return {
        ok: false,
        error: `SMTP login failed for ${env.SMTP_USER} — check SMTP_USER / SMTP_PASS (Gmail needs an app password). ${e.message ?? ''}`.trim(),
        retryable: false,
      }
    }
    const status = e.responseCode ?? 0
    const retryable =
      status === 0 ||
      (status >= 400 && status < 500) ||
      ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS'].includes(e.code ?? '')
    return {
      ok: false,
      error: `SMTP ${e.code ?? status}: ${e.message ?? 'send failed'}`,
      retryable,
    }
  }
}

async function deliverResend(
  event: OutboundEvent,
  built: BuiltEmail,
  replyTo: string | undefined,
): Promise<DeliveryResult> {
  const { error } = await resend().emails.send(
    {
      from: env.MAIL_FROM,
      to: built.to,
      subject: built.email.subject,
      html: built.email.html,
      text: built.email.text,
      ...(replyTo ? { replyTo } : {}),
      ...(built.attachments?.length ? { attachments: built.attachments } : {}),
    },
    // A retry after a timeout must not send it twice.
    { idempotencyKey: event.id },
  )
  if (!error) return { ok: true }

  // The SDK's wording for "the request never reached Resend" — a network
  // problem on our side, not something wrong with the email.
  if (error.name === 'application_error' && !error.statusCode) {
    return {
      ok: false,
      error: 'Could not reach Resend (network error or timeout). Check the server\'s internet connection.',
      retryable: true,
    }
  }

  // Validation errors (bad address, unverified domain) will fail the same way
  // next time; rate limits and outages will not.
  const status = error.statusCode ?? 0
  const retryable =
    status === 0 ||
    status >= 500 ||
    status === 429 ||
    [
      'rate_limit_exceeded',
      'daily_quota_exceeded',
      'concurrent_idempotent_requests',
      'application_error',
      'internal_server_error',
    ].includes(error.name)
  return { ok: false, error: `${error.name}: ${error.message}`, retryable }
}

registerOutboxHandler({
  target: 'email',
  isConfigured: isMailerConfigured,
  deliver,
  describe: () =>
    usesSmtp()
      ? `SMTP ${env.SMTP_HOST} as ${fromAddress()}`
      : `Resend as ${env.MAIL_FROM}`,
})

/** The team inbox(es) told about new requests. */
export function notifyRecipients(): string[] {
  return env.ORDER_NOTIFY_EMAIL.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
