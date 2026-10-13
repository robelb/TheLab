import type { DeliveryResult } from '../outbox.js'

/** One email, ready to hand to a provider. */
export interface MailMessage {
  /** `MAIL_FROM`, e.g. `big little things <bestellung@biglittlethings.de>`. */
  from: string
  to: string[]
  subject: string
  html: string
  text: string
  replyTo?: string
  attachments?: { filename: string; content: Buffer; contentType?: string }[]
  /**
   * Stable per queued email. Providers that support it use it so a retry
   * after a timeout is not delivered twice.
   */
  idempotencyKey: string
}

/**
 * An email provider. Adding one (Postmark, SendGrid, Brevo, Amazon SES…) is a
 * file implementing this, plus a line in `mail/index.ts` — nothing that
 * renders or queues email needs to change.
 *
 * `send` never throws for a failed delivery: it says whether trying again
 * later could help, which is what the outbox's retries go by.
 */
export interface MailTransport {
  /** As set in `MAIL_PROVIDER`. */
  name: string
  /** Has what it needs to send (credentials etc.). */
  isConfigured(): boolean
  /** One line for the startup log, e.g. which server and sender. */
  describe(): string
  send(message: MailMessage): Promise<DeliveryResult>
}
