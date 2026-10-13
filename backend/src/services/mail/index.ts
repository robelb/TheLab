import { logTransport } from './log.js'
import { resendTransport } from './resend.js'
import { smtpTransport } from './smtp.js'
import type { MailTransport } from './types.js'

export type { MailMessage, MailTransport } from './types.js'

/**
 * Every email provider the app can send through, by the name `MAIL_PROVIDER`
 * uses. To add one, write a `MailTransport` next to these and list it here.
 */
const TRANSPORTS: Record<string, MailTransport> = {
  smtp: smtpTransport,
  resend: resendTransport,
  log: logTransport,
}

/**
 * The provider in use.
 *
 * `MAIL_PROVIDER` names it (`smtp`, `resend` or `log`). Left unset, it is
 * worked out as before: SMTP when `SMTP_HOST` is set, otherwise Resend — so an
 * existing deployment needs no change.
 */
function chooseTransport(): MailTransport {
  const named = (process.env.MAIL_PROVIDER ?? '').trim().toLowerCase()
  if (named) {
    const transport = TRANSPORTS[named]
    if (!transport) {
      throw new Error(
        `MAIL_PROVIDER "${named}" is not one of: ${Object.keys(TRANSPORTS).join(', ')}.`,
      )
    }
    return transport
  }
  return process.env.SMTP_HOST?.trim() ? smtpTransport : resendTransport
}

export const mailTransport: MailTransport = chooseTransport()
