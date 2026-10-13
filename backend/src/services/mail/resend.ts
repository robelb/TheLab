import { Resend } from 'resend'
import { env } from '../../config/env.js'
import type { DeliveryResult } from '../outbox.js'
import type { MailMessage, MailTransport } from './types.js'

/**
 * Resend's API. The `MAIL_FROM` domain must be verified in Resend (DNS
 * records); until then it only delivers to the Resend account's own address.
 */

let client: Resend | null = null

function resend(): Resend {
  client ??= new Resend(env.RESEND_API_KEY)
  return client
}

export const resendTransport: MailTransport = {
  name: 'resend',
  isConfigured: () => Boolean(env.RESEND_API_KEY),
  describe: () => `Resend as ${env.MAIL_FROM}`,

  async send(message: MailMessage): Promise<DeliveryResult> {
    const { error } = await resend().emails.send(
      {
        from: message.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
        ...(message.attachments?.length ? { attachments: message.attachments } : {}),
      },
      // A retry after a timeout must not send it twice.
      { idempotencyKey: message.idempotencyKey },
    )
    if (!error) return { ok: true }

    // The SDK's wording for "the request never reached Resend" — a network
    // problem on our side, not something wrong with the email.
    if (error.name === 'application_error' && !error.statusCode) {
      return {
        ok: false,
        error: "Could not reach Resend (network error or timeout). Check the server's internet connection.",
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
  },
}
