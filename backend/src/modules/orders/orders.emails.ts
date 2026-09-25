/**
 * The emails an order sends, and how each is built from the order at send time.
 *
 * Registered with the mailer on import (see `index.ts`), so the mailer never
 * needs to know what an order is.
 */

import { env } from '../../config/env.js'
import type { Invoice } from '../../db/schema/index.js'
import {
  button,
  escapeHtml,
  formatDate,
  formatMoney,
  heading,
  layout,
  linesHtml,
  linesText,
  localeOf,
  paragraph,
  rowsHtml,
  rowsText,
  type EmailLocale,
  type RenderedEmail,
  type Row,
} from '../../emails/layout.js'
import {
  notifyRecipients,
  registerEmailBuilder,
} from '../../services/mailer.js'
import { renderInvoicePdf } from '../../services/invoicePdf.js'
import { getInvoiceByOrder } from './invoices.service.js'
import { getOrder, type OrderDto } from './orders.service.js'

const COUNTRY: Record<string, { de: string; en: string }> = {
  DE: { de: 'Deutschland', en: 'Germany' },
}

function country(code: string | null | undefined, locale: EmailLocale): string | null {
  if (!code) return null
  return COUNTRY[code.toUpperCase()]?.[locale] ?? code
}

function greetingName(order: OrderDto): string {
  return order.contact.firstName?.trim() || order.contact.name
}

function itemRows(order: OrderDto, locale: EmailLocale): Row[] {
  return order.items.map((item) => ({
    label: `${item.name} × ${item.quantity}`,
    value: formatMoney(item.unitPrice * item.quantity, order.currency, locale),
  }))
}

function billingLines(order: OrderDto, locale: EmailLocale): string[] {
  const b = order.billing
  if (!b) return []
  return [
    b.company,
    b.name ?? '',
    b.street,
    b.line2 ?? '',
    `${b.zip} ${b.city}`,
    country(b.country, locale) ?? '',
    b.vatId ? `${locale === 'de' ? 'USt-IdNr.' : 'VAT ID'}: ${b.vatId}` : '',
    b.poNumber ? `${locale === 'de' ? 'Bestellnummer' : 'PO number'}: ${b.poNumber}` : '',
  ]
}

function deliveryLines(order: OrderDto, locale: EmailLocale): string[] {
  const d = order.delivery
  if (!d) return []
  if (d.sameAsBilling) {
    return [locale === 'de' ? 'An die Rechnungsadresse' : 'To the billing address']
  }
  return [
    d.address ?? '',
    d.line2 ?? '',
    [d.zip, d.city].filter(Boolean).join(' '),
    country(d.country, locale) ?? '',
  ]
}

// ---------------------------------------------------------------------------
// Request received — to the customer, the moment it lands.
// ---------------------------------------------------------------------------

export function orderReceivedEmail(order: OrderDto): RenderedEmail {
  const locale = localeOf(order.locale)
  const de = locale === 'de'
  const m = (n: number) => formatMoney(n, order.currency, locale)

  const totals: Row[] = [
    { label: de ? 'Zwischensumme' : 'Subtotal', value: m(order.subtotal) },
    {
      label: de ? 'Versand' : 'Shipping',
      value: order.shipping === 0 ? (de ? 'kostenlos' : 'free') : m(order.shipping),
    },
    {
      label: de ? 'Voraussichtlich gesamt (netto, zzgl. MwSt.)' : 'Estimated total (net, plus VAT)',
      value: m(order.total),
      strong: true,
    },
  ]

  const subject = de
    ? `Ihre Bestellanfrage ${order.reference} ist bei uns eingegangen`
    : `We've received your order request ${order.reference}`
  const intro = de
    ? `vielen Dank für Ihre Bestellanfrage. Wir prüfen sie jetzt und melden uns in Kürze. Sobald wir Ihre Bestellung bestätigt haben, schicken wir Ihnen die Auftragsbestätigung mit der Rechnung per E-Mail.`
    : `thank you for your order request. We're reviewing it now and will be in touch shortly. Once we've confirmed your order, we'll email you the confirmation with the invoice.`
  const notBinding = de
    ? 'Bis dahin ist Ihre Anfrage unverbindlich und es wird nichts berechnet. Die Preise unten sind vorläufig.'
    : "Until then your request isn't binding and nothing is charged. The prices below are estimates."

  const billing = billingLines(order, locale)
  const delivery = deliveryLines(order, locale)
  const neededBy = order.delivery?.neededBy
  const notes = order.delivery?.notes

  const html = layout({
    locale,
    preheader: subject,
    body: [
      `<h1 style="font-size:20px;margin:0 0 16px;">${escapeHtml(de ? 'Danke für Ihre Anfrage!' : 'Thanks for your request!')}</h1>`,
      paragraph(`${de ? 'Hallo' : 'Hi'} ${escapeHtml(greetingName(order))},`),
      paragraph(escapeHtml(intro)),
      paragraph(`<strong>${escapeHtml(de ? 'Ihre Referenz' : 'Your reference')}: ${escapeHtml(order.reference)}</strong>`),
      paragraph(`<span style="color:#666;">${escapeHtml(notBinding)}</span>`),
      heading(de ? 'Ihre Auswahl' : 'Your selection'),
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rowsHtml(itemRows(order, locale))}</table>`,
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid #eee;margin-top:8px;">${rowsHtml(totals)}</table>`,
      billing.length ? heading(de ? 'Rechnungsadresse' : 'Billing address') + paragraph(linesHtml(billing)) : '',
      delivery.length ? heading(de ? 'Lieferadresse' : 'Delivery address') + paragraph(linesHtml(delivery)) : '',
      neededBy ? paragraph(`<strong>${escapeHtml(de ? 'Lieferdatum' : 'Delivery date')}:</strong> ${escapeHtml(formatDate(neededBy, locale))}`) : '',
      notes ? paragraph(`<strong>${escapeHtml(de ? 'Ihre Anmerkungen' : 'Your notes')}:</strong><br>${escapeHtml(notes)}`) : '',
      paragraph(
        escapeHtml(
          de
            ? 'Fragen? Antworten Sie einfach auf diese E-Mail.'
            : 'Questions? Just reply to this email.',
        ),
      ),
    ].join('\n'),
  })

  const text = [
    `${de ? 'Hallo' : 'Hi'} ${greetingName(order)},`,
    '',
    intro,
    '',
    `${de ? 'Ihre Referenz' : 'Your reference'}: ${order.reference}`,
    notBinding,
    '',
    rowsText(itemRows(order, locale)),
    '',
    rowsText(totals),
    billing.length ? `\n${de ? 'Rechnungsadresse' : 'Billing address'}:\n${linesText(billing)}` : '',
    delivery.length ? `\n${de ? 'Lieferadresse' : 'Delivery address'}:\n${linesText(delivery)}` : '',
    neededBy ? `\n${de ? 'Lieferdatum' : 'Delivery date'}: ${formatDate(neededBy, locale)}` : '',
    notes ? `\n${de ? 'Ihre Anmerkungen' : 'Your notes'}: ${notes}` : '',
  ].join('\n')

  return { subject, html, text }
}

// ---------------------------------------------------------------------------
// New request — to the team inbox.
// ---------------------------------------------------------------------------

export function orderNotifyEmail(order: OrderDto): RenderedEmail {
  const origin = order.collectionName
    ? `Landingpage „${order.collectionName}“ (/c/${order.collectionSlug})`
    : 'Shop'
  const m = (n: number) => formatMoney(n, order.currency, 'de')
  const link = `${env.PUBLIC_SHOP_URL}/dashboard/orders/${order.id}`
  const subject = `Neue Anfrage ${order.reference} · ${order.collectionName ?? 'Shop'} · ${m(order.total)}`

  const facts: Row[] = [
    { label: 'Herkunft', value: origin },
    { label: 'Kontakt', value: `${order.contact.name} <${order.contact.email}>` },
    { label: 'Firma', value: order.billing?.company ?? order.contact.company ?? '—' },
    { label: 'Telefon', value: order.contact.phone ?? '—' },
    { label: 'Gast', value: order.isGuest ? 'ja' : 'nein' },
    { label: 'Gewünscht bis', value: order.delivery?.neededBy ? formatDate(order.delivery.neededBy, 'de') : '—' },
    { label: 'Geschätzt (netto)', value: m(order.total), strong: true },
  ]
  const a = order.attribution
  if (a?.utmSource || a?.gclid) {
    facts.push({
      label: 'Kampagne',
      value: [a.utmSource, a.utmMedium, a.utmCampaign, a.gclid ? 'gclid' : null]
        .filter(Boolean)
        .join(' / '),
    })
  }

  const html = layout({
    locale: 'de',
    preheader: subject,
    footer: 'Interne Benachrichtigung über eine neue Anfrage.',
    body: [
      `<h1 style="font-size:20px;margin:0 0 16px;">${escapeHtml(`Neue Anfrage ${order.reference}`)}</h1>`,
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml(facts)}</table>`,
      heading('Positionen'),
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml(itemRows(order, 'de'))}</table>`,
      order.delivery?.notes ? heading('Anmerkungen') + paragraph(escapeHtml(order.delivery.notes)) : '',
      button('Im Dashboard öffnen', link),
    ].join('\n'),
  })
  const text = [
    `Neue Anfrage ${order.reference}`,
    '',
    rowsText(facts),
    '',
    rowsText(itemRows(order, 'de')),
    order.delivery?.notes ? `\nAnmerkungen: ${order.delivery.notes}` : '',
    '',
    link,
  ].join('\n')
  return { subject, html, text }
}

// ---------------------------------------------------------------------------
// Confirmed — to the customer, with the invoice attached.
// ---------------------------------------------------------------------------

export function orderConfirmedEmail(order: OrderDto, invoice: Invoice): RenderedEmail {
  const locale = localeOf(order.locale)
  const de = locale === 'de'
  const m = (n: number | string) => formatMoney(Number(n), invoice.currency, locale)
  const rate = new Intl.NumberFormat(de ? 'de-DE' : 'en-GB', {
    maximumFractionDigits: 2,
  }).format(Number(invoice.vatRate))
  const due = formatDate(invoice.dueAt, locale)
  const seller = invoice.seller

  const subject = de
    ? `Auftragsbestätigung ${order.reference} – Rechnung ${invoice.number}`
    : `Order confirmation ${order.reference} – invoice ${invoice.number}`
  const intro = de
    ? `wir haben Ihre Bestellung ${order.reference} bestätigt und machen uns an die Arbeit. Im Anhang finden Sie die Rechnung ${invoice.number}.`
    : `we've confirmed your order ${order.reference} and are getting to work on it. Please find invoice ${invoice.number} attached.`

  const lines: Row[] = invoice.lines.map((l) => ({
    label: `${l.description} × ${l.quantity}`,
    value: m(l.total),
  }))
  const totals: Row[] = [
    { label: de ? 'Nettobetrag' : 'Net amount', value: m(invoice.net) },
    { label: de ? `zzgl. USt. ${rate} %` : `VAT ${rate} %`, value: m(invoice.vat) },
    { label: de ? 'Rechnungsbetrag' : 'Total due', value: m(invoice.gross), strong: true },
  ]
  const bank: Row[] = [
    { label: de ? 'Empfänger' : 'Payee', value: seller.name },
    ...(seller.iban ? [{ label: 'IBAN', value: seller.iban }] : []),
    ...(seller.bic ? [{ label: 'BIC', value: seller.bic }] : []),
    ...(seller.bankName ? [{ label: 'Bank', value: seller.bankName }] : []),
    { label: de ? 'Verwendungszweck' : 'Reference', value: invoice.number },
    { label: de ? 'Fällig bis' : 'Due by', value: due, strong: true },
  ]
  const payText = de
    ? `Bitte überweisen Sie ${m(invoice.gross)} bis zum ${due} unter Angabe der Rechnungsnummer.`
    : `Please transfer ${m(invoice.gross)} by ${due}, quoting the invoice number.`

  const html = layout({
    locale,
    preheader: subject,
    footer: `${seller.name} · ${seller.street} · ${seller.zip} ${seller.city}`,
    body: [
      `<h1 style="font-size:20px;margin:0 0 16px;">${escapeHtml(de ? 'Ihre Bestellung ist bestätigt' : 'Your order is confirmed')}</h1>`,
      paragraph(`${de ? 'Hallo' : 'Hi'} ${escapeHtml(greetingName(order))},`),
      paragraph(escapeHtml(intro)),
      heading(de ? 'Bestellung' : 'Order'),
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml(lines)}</table>`,
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;margin-top:8px;">${rowsHtml(totals)}</table>`,
      heading(de ? 'Zahlung per Rechnung' : 'Payment by invoice'),
      paragraph(escapeHtml(payText)),
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml(bank)}</table>`,
      paragraph(
        escapeHtml(
          de
            ? 'Vielen Dank für Ihren Auftrag! Bei Fragen antworten Sie einfach auf diese E-Mail.'
            : 'Thank you for your order! If you have any questions, just reply to this email.',
        ),
      ),
    ].join('\n'),
  })
  const text = [
    `${de ? 'Hallo' : 'Hi'} ${greetingName(order)},`,
    '',
    intro,
    '',
    rowsText(lines),
    '',
    rowsText(totals),
    '',
    payText,
    rowsText(bank),
  ].join('\n')
  return { subject, html, text }
}

// ---------------------------------------------------------------------------
// Builders: queued payload → message, rendered from the order as it is now.
// ---------------------------------------------------------------------------

function orderIdOf(payload: Record<string, unknown>): string | null {
  return typeof payload.orderId === 'string' ? payload.orderId : null
}

async function loadOrder(payload: Record<string, unknown>): Promise<OrderDto | null> {
  const id = orderIdOf(payload)
  return id ? getOrder({ companyId: null, orderId: id }) : null
}

registerEmailBuilder('email.order_received', async (payload) => {
  const order = await loadOrder(payload)
  if (!order) return null
  return { to: [order.contact.email], email: orderReceivedEmail(order) }
})

registerEmailBuilder('email.order_notify', async (payload) => {
  const to = notifyRecipients()
  if (to.length === 0) return null
  const order = await loadOrder(payload)
  if (!order) return null
  // Replying goes straight to the customer.
  return { to, email: orderNotifyEmail(order), replyTo: order.contact.email }
})

registerEmailBuilder('email.order_confirmed', async (payload) => {
  const order = await loadOrder(payload)
  if (!order) return null
  const invoice = await getInvoiceByOrder(order.id)
  if (!invoice) return null
  const pdf = await renderInvoicePdf(invoice)
  const to = [...new Set([order.contact.email, invoice.buyer.email].filter(Boolean))]
  return {
    to,
    email: orderConfirmedEmail(order, invoice),
    attachments: [
      { filename: `${invoice.number}.pdf`, content: pdf, contentType: 'application/pdf' },
    ],
  }
})
