import dns from 'node:dns/promises'
import net from 'node:net'
import nodemailer, { type Transporter } from 'nodemailer'
import { env } from '../../config/env.js'
import type { DeliveryResult } from '../outbox.js'
import type { MailMessage, MailTransport } from './types.js'

/**
 * Any mailbox over SMTP — a Google Workspace or Gmail account with an app
 * password, Microsoft 365, or a relay such as SES / Postmark / Brevo SMTP.
 * No domain has to be verified with a separate provider.
 */

/**
 * Who the email is from.
 *
 * A mailbox's SMTP server sends only as that mailbox — Gmail rewrites any
 * other From, and others refuse it — so the name from `MAIL_FROM` is kept and
 * the address is the account's own.
 */
function fromAddress(from: string): string {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  const address = match ? match[2] : from.trim()
  if (address.toLowerCase() === env.SMTP_USER.toLowerCase()) return from
  const name = match?.[1]?.trim()
  return name ? `"${name.replace(/"/g, '')}" <${env.SMTP_USER}>` : env.SMTP_USER
}

/**
 * The SMTP server's IPv4 address, or its name when there is none to be had.
 *
 * Nodemailer picks at random among the server's IPv4 and IPv6 addresses. On a
 * network that has an IPv6 interface but no IPv6 route — common on home and
 * office Wi-Fi — every IPv6 pick fails with ENETUNREACH, and when the IPv4
 * fallback then hits a busy moment the whole send fails. Asking for IPv4 up
 * front takes the coin toss out of it.
 */
async function ipv4For(host: string): Promise<string> {
  if (net.isIP(host)) return host
  try {
    const [address] = await dns.resolve4(host)
    return address ?? host
  } catch {
    return host
  }
}

let transporter: Promise<Transporter> | null = null

/**
 * One pooled connection, reused for every email and fed one message at a time.
 *
 * Gmail rate-limits how fast one address may open connections ("421 4.4.5
 * Server busy"), and an order sends two emails at once — so a fresh connection
 * per email had the second one turned away. Through a single pooled connection
 * they queue behind each other instead.
 */
function smtp(): Promise<Transporter> {
  transporter ??= ipv4For(env.SMTP_HOST).then((host) =>
    nodemailer.createTransport({
      pool: true,
      maxConnections: 1,
      maxMessages: 100,
      host,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      // Connecting to the address, but the certificate is for the name.
      servername: env.SMTP_HOST,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    }),
  )
  return transporter
}

/** Drop the pool, so the next send re-resolves the address and reconnects. */
function resetSmtp(): void {
  const stale = transporter
  transporter = null
  void stale?.then((t) => t.close()).catch(() => {})
}

/** A failure that is about this moment rather than about the email. */
function isTransient(err: { code?: string; responseCode?: number }): boolean {
  const status = err.responseCode ?? 0
  return (
    (status >= 400 && status < 500) ||
    ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNRESET', 'EPROTOCOL'].includes(
      err.code ?? '',
    )
  )
}

/** Short in-process retries before handing a failure back to the outbox. */
const SMTP_RETRY_DELAYS_MS = [2_000, 6_000]

function smtpFailure(e: {
  code?: string
  responseCode?: number
  message?: string
}): DeliveryResult {
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
  const retryable = status === 0 || isTransient(e)
  return {
    ok: false,
    error: `SMTP ${e.code ?? status}: ${e.message ?? 'send failed'}`,
    retryable,
  }
}

export const smtpTransport: MailTransport = {
  name: 'smtp',
  isConfigured: () => Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS),
  describe: () => `SMTP ${env.SMTP_HOST} as ${fromAddress(env.MAIL_FROM)}`,

  async send(message: MailMessage): Promise<DeliveryResult> {
    const mail = {
      from: fromAddress(message.from),
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      ...(message.attachments?.length ? { attachments: message.attachments } : {}),
      // SMTP has no idempotency key. A stable Message-ID at least lets the
      // receiving side fold a retried copy into the first one.
      messageId: `<${message.idempotencyKey}@thelab.outbox>`,
    }

    // A busy server or a dropped connection usually clears within seconds, so
    // it is tried again here, on a fresh connection, before the outbox's
    // backoff — which starts at 30 seconds — is left to deal with it.
    for (let attempt = 0; ; attempt++) {
      try {
        await (await smtp()).sendMail(mail)
        return { ok: true }
      } catch (err) {
        const e = err as { code?: string; responseCode?: number; message?: string }
        const delay = SMTP_RETRY_DELAYS_MS[attempt]
        if (e.code === 'EAUTH' || !isTransient(e) || delay === undefined) {
          if (isTransient(e)) resetSmtp()
          return smtpFailure(e)
        }
        console.warn(
          `[mail:smtp] ${e.code ?? e.responseCode}: ${e.message ?? 'send failed'} — retrying in ${delay / 1000}s`,
        )
        resetSmtp()
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  },
}
