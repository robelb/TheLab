/**
 * The emails an order sends, and how each is built from the order at send time.
 *
 * Registered with the mailer on import (see `index.ts`), so the mailer never
 * needs to know what an order is.
 */

import { IS_PRODUCTION, dashboardUrl, env } from '../../config/env.js'
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
import { registerEmailBuilder } from '../../services/mailer.js'
import { renderInvoicePdf } from '../../services/invoicePdf.js'
import { vatRateFor, zeroVatReason } from '../../lib/shipping.js'
import { getNotifySettings } from '../settings/settings.service.js'
import { getInvoiceByOrder } from './invoices.service.js'
import { getOrder, type OrderDto } from './orders.service.js'

/** A country's name in the email's language, e.g. `AT` → „Österreich“. */
function country(code: string | null | undefined, locale: EmailLocale): string | null {
  if (!code) return null
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

/** The VAT line's label: the rate, and why it is nothing when it is. */
function vatLabel(rate: number, billingCountry: string | null | undefined, de: boolean): string {
  const shown = new Intl.NumberFormat(de ? 'de-DE' : 'en-GB', {
    maximumFractionDigits: 2,
  }).format(rate)
  if (rate > 0) return de ? `zzgl. USt. ${shown} %` : `VAT ${shown} %`
  // Our exemption wording is for deliveries abroad (see invoicePdf).
  if (billingCountry === 'DE') return de ? 'USt. 0 %' : 'VAT 0 %'
  const reason = zeroVatReason(billingCountry, de ? 'de' : 'en').short
  return de ? `USt. 0 % (${reason})` : `VAT 0 % (${reason})`
}

/** „Einzelversand“, „Gemischt: 60 zusammen, 40 einzeln“ and so on. */
function shippingMethodText(order: OrderDto, de: boolean): string {
  if (order.shippingMethod === 'individual') {
    return de ? 'Einzelversand an jede:n Empfänger:in' : 'Individually, one box per recipient'
  }
  if (order.shippingMethod === 'mixed') {
    const split = order.shippingSplit
    const detail = split
      ? de
        ? `: ${split.bulkBoxes} an die Lieferadresse, ${split.individualBoxes} einzeln`
        : `: ${split.bulkBoxes} to the delivery address, ${split.individualBoxes} individually`
      : ''
    return (de ? 'Gemischt' : 'Mixed') + detail
  }
  return de ? 'Sammelversand an eine Adresse' : 'In bulk, everything to one address'
}

/**
 * Whether any box in the order has logo stickers, and whether every such box
 * came with its logo file: `missing` means it is to follow.
 */
function stickerLogoStatus(order: OrderDto): 'uploaded' | 'missing' | null {
  const boxes = order.items
    .map((item) => item.box as { stickers?: unknown; stickerLogo?: { url?: string } | null } | null)
    .filter((box) => box?.stickers)
  if (boxes.length === 0) return null
  return boxes.every((box) => box?.stickerLogo?.url) ? 'uploaded' : 'missing'
}

/** Which parts of the boxes were designed by the customer: the box, the sticker. */
function designedParts(order: OrderDto, de: boolean): string | null {
  type DesignedBox = { packaging?: { customPrint?: boolean } | null; stickers?: { customPrint?: boolean } | null }
  const boxes = order.items.map((item) => item.box as DesignedBox | null).filter(Boolean)
  const parts = [
    boxes.some((box) => box?.packaging?.customPrint) ? (de ? 'Box' : 'box') : null,
    boxes.some((box) => box?.stickers?.customPrint) ? 'Sticker' : null,
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

/** What to send us when the sticker logo comes after the request. */
function logoRequest(de: boolean): string {
  return de
    ? 'Für die Logo-Sticker benötigen wir noch Ihr Logo – am besten als Vektordatei (PDF oder SVG). Antworten Sie einfach mit der Datei im Anhang.'
    : 'For the logo stickers we still need your logo — ideally as a vector file (PDF or SVG). Just reply with the file attached.'
}

/** What to send us when the recipient addresses come after the request. */
function addressesRequest(de: boolean): string {
  return de
    ? 'Bitte senden Sie uns die Adressen der Empfänger:innen als Antwort auf diese E-Mail – am liebsten als Excel- oder CSV-Liste mit Name, Firma, Straße und Hausnummer, PLZ, Ort und Land. Wir melden uns, falls etwas fehlt.'
    : "Please send us the recipients' addresses by replying to this email — ideally as an Excel or CSV list with name, company, street and number, postcode, city and country. We'll be in touch if anything is missing."
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

  // The same figures the checkout showed: net, the VAT on it, and the gross.
  const vatRate = vatRateFor(order.billing?.country, env.VAT_RATE)
  const vat = Math.round(order.total * vatRate) / 100
  const totals: Row[] = [
    { label: de ? 'Zwischensumme' : 'Subtotal', value: m(order.subtotal) },
    {
      label: de ? 'Versand' : 'Shipping',
      value: order.shipping === 0 ? (de ? 'kostenlos' : 'free') : m(order.shipping),
    },
    { label: de ? 'Nettobetrag' : 'Net amount', value: m(order.total) },
    { label: vatLabel(vatRate, order.billing?.country, de), value: m(vat) },
    {
      label: de ? 'Voraussichtlich gesamt' : 'Estimated total',
      value: m(order.total + vat),
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
  const delivery = order.shippingMethod === 'individual' ? [] : deliveryLines(order, locale)
  const neededBy = order.delivery?.neededBy
  const notes = order.delivery?.notes
  const shippingLabel = de ? 'Versand' : 'Shipping'
  const method = shippingMethodText(order, de)
  const logoMissing = stickerLogoStatus(order) === 'missing'

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
      heading(shippingLabel) + paragraph(escapeHtml(method)),
      order.addressesLater ? paragraph(`<strong>${escapeHtml(addressesRequest(de))}</strong>`) : '',
      logoMissing ? paragraph(`<strong>${escapeHtml(logoRequest(de))}</strong>`) : '',
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
    `\n${shippingLabel}: ${method}`,
    order.addressesLater ? addressesRequest(de) : '',
    logoMissing ? logoRequest(de) : '',
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
  // In the language the customer used, like every other email the order sends.
  const locale = localeOf(order.locale)
  const de = locale === 'de'
  const origin = order.collectionName
    ? `${de ? 'Kollektion' : 'Collection'} „${order.collectionName}“ (/c/${order.collectionSlug})`
    : 'Shop'
  const m = (n: number) => formatMoney(n, order.currency, locale)
  const link = dashboardUrl(`/orders/${order.id}`)
  const title = `${de ? 'Neue Anfrage' : 'New request'} ${order.reference}`
  // Requests placed on a local or test server say so, so nobody acts on one.
  const subject = `${IS_PRODUCTION ? '' : '[DEV] '}${title} · ${order.collectionName ?? 'Shop'} · ${m(order.total)}`

  const facts: Row[] = [
    { label: de ? 'Herkunft' : 'Origin', value: origin },
    { label: de ? 'Kontakt' : 'Contact', value: `${order.contact.name} <${order.contact.email}>` },
    { label: de ? 'Firma' : 'Company', value: order.billing?.company ?? order.contact.company ?? '—' },
    { label: de ? 'Telefon' : 'Phone', value: order.contact.phone ?? '—' },
    { label: de ? 'Gast' : 'Guest', value: order.isGuest ? (de ? 'ja' : 'yes') : (de ? 'nein' : 'no') },
    {
      label: de ? 'Lieferdatum' : 'Delivery date',
      value: order.delivery?.neededBy ? formatDate(order.delivery.neededBy, locale) : '—',
    },
    { label: de ? 'Versand' : 'Shipping', value: shippingMethodText(order, de) },
    ...(order.addressesLater
      ? [{ label: de ? 'Adressen' : 'Addresses', value: de ? 'folgen per E-Mail' : 'to follow by email' }]
      : []),
    ...(stickerLogoStatus(order)
      ? [
          {
            label: de ? 'Sticker-Logo' : 'Sticker logo',
            value:
              stickerLogoStatus(order) === 'uploaded'
                ? de ? 'hochgeladen (im Dashboard)' : 'uploaded (see dashboard)'
                : de ? 'folgt per E-Mail' : 'to follow by email',
          },
        ]
      : []),
    ...(designedParts(order, de)
      ? [
          {
            label: de ? 'Eigenes Design' : 'Custom design',
            value: `${designedParts(order, de)} — ${de ? 'Druckdaten im Dashboard' : 'print files in the dashboard'}`,
          },
        ]
      : []),
    {
      label: de ? 'Rechnungsland' : 'Invoice country',
      value: country(order.billing?.country, locale) ?? '—',
    },
    { label: de ? 'Geschätzt (netto)' : 'Estimated (net)', value: m(order.total), strong: true },
  ]
  const a = order.attribution
  if (a?.utmSource || a?.gclid) {
    facts.push({
      label: de ? 'Kampagne' : 'Campaign',
      value: [a.utmSource, a.utmMedium, a.utmCampaign, a.gclid ? 'gclid' : null]
        .filter(Boolean)
        .join(' / '),
    })
  }
  const notesLabel = de ? 'Anmerkungen' : 'Notes'
  const itemsLabel = de ? 'Positionen' : 'Items'

  const html = layout({
    locale,
    preheader: subject,
    footer: de
      ? 'Interne Benachrichtigung über eine neue Anfrage.'
      : 'Internal notification about a new request.',
    body: [
      `<h1 style="font-size:20px;margin:0 0 16px;">${escapeHtml(title)}</h1>`,
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml(facts)}</table>`,
      heading(itemsLabel),
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml(itemRows(order, locale))}</table>`,
      order.delivery?.notes ? heading(notesLabel) + paragraph(escapeHtml(order.delivery.notes)) : '',
      button(de ? 'Im Dashboard öffnen' : 'Open in dashboard', link),
    ].join('\n'),
  })
  const text = [
    title,
    '',
    rowsText(facts),
    '',
    rowsText(itemRows(order, locale)),
    order.delivery?.notes ? `\n${notesLabel}: ${order.delivery.notes}` : '',
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
    {
      label: vatLabel(Number(invoice.vatRate), invoice.buyer.country, de),
      value: m(invoice.vat),
    },
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
  const { emails: to } = await getNotifySettings()
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
