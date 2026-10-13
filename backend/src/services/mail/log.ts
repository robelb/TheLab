import type { MailTransport } from './types.js'

/**
 * Sends nothing: prints each email to the server log instead. For local
 * development and staging, where no real customer should receive anything.
 */
export const logTransport: MailTransport = {
  name: 'log',
  isConfigured: () => true,
  describe: () => 'log only — emails are printed, not sent',
  async send(message) {
    console.log(
      `[mail:log] to ${message.to.join(', ')} — ${message.subject}` +
        (message.attachments?.length
          ? ` (+${message.attachments.map((a) => a.filename).join(', ')})`
          : ''),
    )
    return { ok: true }
  },
}
