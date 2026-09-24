/**
 * The frame every customer email sits in, and the small helpers the templates
 * share.
 *
 * Plain strings rather than a templating library: there are three emails, they
 * are tables of text, and inline styles are the only styling mail clients
 * reliably honour anyway.
 */

export type EmailLocale = 'de' | 'en'

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export const BRAND = {
  name: 'big little things',
  color: '#FE522A',
  logo: 'https://biglittlethings.de/wp-content/uploads/2021/03/big-things-logo.png',
}

export function localeOf(value: string | null | undefined): EmailLocale {
  return value === 'en' ? 'en' : 'de'
}

export function escapeHtml(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function formatMoney(
  amount: number,
  currency: string,
  locale: EmailLocale,
): string {
  return new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-GB', {
    style: 'currency',
    currency: currency || 'EUR',
  }).format(amount)
}

export function formatDate(
  value: string | Date | null | undefined,
  locale: EmailLocale,
): string {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

/** One row of a two-column summary table. */
export interface Row {
  label: string
  value: string
  strong?: boolean
}

export function rowsHtml(rows: Row[]): string {
  return rows
    .map(
      (r) => `<tr>
  <td style="padding:6px 0;color:#555;${r.strong ? 'font-weight:600;color:#111;' : ''}">${escapeHtml(r.label)}</td>
  <td style="padding:6px 0;text-align:right;${r.strong ? 'font-weight:600;' : ''}">${escapeHtml(r.value)}</td>
</tr>`,
    )
    .join('\n')
}

export function rowsText(rows: Row[]): string {
  return rows.map((r) => `${r.label}: ${r.value}`).join('\n')
}

/** A block of address-like lines, blank ones dropped. */
export function linesHtml(lines: (string | null | undefined)[]): string {
  return lines
    .filter((l): l is string => Boolean(l && l.trim()))
    .map(escapeHtml)
    .join('<br>')
}

export function linesText(lines: (string | null | undefined)[]): string {
  return lines.filter((l): l is string => Boolean(l && l.trim())).join('\n')
}

export function heading(text: string): string {
  return `<h2 style="font-size:15px;margin:28px 0 8px;color:#111;">${escapeHtml(text)}</h2>`
}

export function paragraph(html: string): string {
  return `<p style="margin:0 0 14px;line-height:1.55;">${html}</p>`
}

export function button(label: string, href: string): string {
  return `<p style="margin:24px 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:${BRAND.color};color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;">${escapeHtml(label)}</a></p>`
}

export function layout(params: {
  locale: EmailLocale
  preheader: string
  body: string
  footer?: string
}): string {
  const footer =
    params.footer ??
    (params.locale === 'de'
      ? `Sie erhalten diese E-Mail, weil Sie bei ${BRAND.name} eine Anfrage gestellt haben.`
      : `You are receiving this email because you sent a request to ${BRAND.name}.`)
  return `<!doctype html>
<html lang="${params.locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;color:#222;">
<span style="display:none;max-height:0;overflow:hidden;">${escapeHtml(params.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;">
<tr><td style="padding:24px 28px;border-bottom:3px solid ${BRAND.color};">
<img src="${BRAND.logo}" alt="${BRAND.name}" height="36" style="display:block;height:36px;border:0;">
</td></tr>
<tr><td style="padding:28px;">
${params.body}
</td></tr>
<tr><td style="padding:18px 28px;background:#fafaf9;color:#888;font-size:12px;line-height:1.5;">
${escapeHtml(footer)}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}
