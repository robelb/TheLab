import { Resend } from 'resend'
import { env } from '../config/env.js'
import type { OutboundEvent, OutboundEventKind } from '../db/schema/index.js'
import type { RenderedEmail } from '../emails/layout.js'
import { enqueue, registerOutboxHandler, type DeliveryResult } from './outbox.js'

/**
 * Customer and team email, sent through Resend via the outbox.
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

export function isMailerConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY)
}

/** Queue an email. Never throws; never waits on Resend. */
export async function enqueueEmail(
  kind: EmailKind,
  payload: Record<string, unknown>,
): Promise<void> {
  await enqueue('email', kind, payload)
}

let client: Resend | null = null

function resend(): Resend {
  client ??= new Resend(env.RESEND_API_KEY)
  return client
}

async function deliver(event: OutboundEvent): Promise<DeliveryResult> {
  const builder = builders.get(event.kind as EmailKind)
  if (!builder) {
    return { ok: false, error: `No email builder for ${event.kind}`, retryable: false }
  }

  const built = await builder(event.payload)
  if (!built || built.to.length === 0) return { ok: true }

  const replyTo = built.replyTo || env.MAIL_REPLY_TO || undefined
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
  describe: () => `Resend as ${env.MAIL_FROM}`,
})

/** The team inbox(es) told about new requests. */
export function notifyRecipients(): string[] {
  return env.ORDER_NOTIFY_EMAIL.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
