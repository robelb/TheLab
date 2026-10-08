import PDFDocument from 'pdfkit'
import type { Invoice, InvoiceAddress } from '../db/schema/index.js'
import { BRAND } from '../emails/layout.js'

/**
 * An invoice as a PDF, drawn from the invoice row alone.
 *
 * Everything printed comes from what was copied onto the row when it was
 * issued, never from the live order or config — so the same invoice renders as
 * the same document however long after it went out.
 *
 * Laid out after our own sales invoices (the JTL "Sales Invoice Document"), so
 * an invoice from the shop is indistinguishable from one issued by hand: the
 * logo and our address line, shipping and billing address side by side, the
 * invoice facts, a short note, the items under a tinted header, the totals
 * between hairlines and our address, contact and bank details in the footer.
 * Covers what §14 UStG asks for — both parties, our VAT id, number and dates,
 * what was supplied, net / VAT rate / VAT / gross. pdfkit's built-in Helvetica
 * covers € and umlauts, so no font files ship with the image.
 */

type Locale = 'de' | 'en'

const LABELS = {
  de: {
    invoice: 'Rechnung',
    vatId: 'USt-IdNr',
    shipping: 'Lieferadresse',
    billing: 'Rechnungsadresse',
    number: 'Rechnungsnummer',
    documentDate: 'Belegdatum',
    deliveryDate: 'Lieferdatum',
    dueDate: 'Fälligkeitsdatum',
    orderNumber: 'Auftragsnummer',
    externalOrderNumber: 'Externe Auftragsnummer',
    customerVat: 'USt-IdNr.',
    greeting: 'Sehr geehrte Damen und Herren,',
    thanks: (brand: string) =>
      `vielen Dank für Ihre Bestellung und Ihr Vertrauen in ${brand}.`,
    regards: 'Mit freundlichen Grüßen',
    team: (brand: string) => `Ihr ${brand} Team`,
    pos: 'Pos.',
    qty: 'Menge',
    sku: 'Art.-Nr.',
    name: 'Artikelname',
    taxValue: 'Steuersatz',
    netPrice: 'Nettopreis',
    totalNet: 'Gesamt netto',
    vat: (rate: string) => `MwSt. (${rate}):`,
    sumNet: 'Gesamt netto:',
    total: 'Gesamtbetrag:',
    phone: 'Tel',
    email: 'E-Mail',
    web: 'Web',
    page: 'Seite',
  },
  en: {
    invoice: 'Invoice',
    vatId: 'USt-IdNr',
    shipping: 'Shipping Address',
    billing: 'Billing Address',
    number: 'Invoice Number',
    documentDate: 'Document Date',
    deliveryDate: 'Delivery Date',
    dueDate: 'Due Date',
    orderNumber: 'Order Number',
    externalOrderNumber: 'External Order Number',
    customerVat: 'VAT ID',
    greeting: 'Dear sir or madam,',
    thanks: (brand: string) => `Thank you for your order and your trust in ${brand}.`,
    regards: 'Kind regards,',
    team: (brand: string) => `Your ${brand} team`,
    pos: 'Pos.',
    qty: 'Qty.',
    sku: 'Art. Nr.',
    name: 'Art. Name',
    taxValue: 'Tax Value',
    netPrice: 'Net Price',
    totalNet: 'Total Net',
    vat: (rate: string) => `VAT (${rate}):`,
    sumNet: 'Total Net:',
    total: 'Total Amount:',
    phone: 'Tel',
    email: 'E-Mail',
    web: 'Web',
    page: 'Page',
  },
} as const

const COUNTRY: Record<Locale, Record<string, string>> = {
  de: { DE: 'Deutschland' },
  en: { DE: 'Germany' },
}

const INK = '#1A1A1A'
const MUTED = '#6B6B6B'
/** The table header tint and the hairlines around the totals. */
const TINT = '#F9E3DD'
const RULE = '#F3DCD4'

/**
 * The logo, fetched once per process. It is decoration, not invoice content:
 * if it cannot be had the name is set in type instead and the invoice still
 * goes out.
 */
let logo: Promise<Buffer | null> | null = null
function brandLogo(): Promise<Buffer | null> {
  logo ??= fetch(BRAND.logo, { signal: AbortSignal.timeout(4000) })
    .then(async (res) => (res.ok ? Buffer.from(await res.arrayBuffer()) : null))
    .catch(() => null)
    .then((buf) => {
      if (!buf) logo = null // try again next time
      return buf
    })
  return logo
}

export async function renderInvoicePdf(invoice: Invoice): Promise<Buffer> {
  const locale: Locale = invoice.locale === 'en' ? 'en' : 'de'
  const L = LABELS[locale]
  const intl = locale === 'de' ? 'de-DE' : 'en-US'
  const money = (n: number | string) =>
    new Intl.NumberFormat(intl, { style: 'currency', currency: invoice.currency }).format(
      Number(n),
    )
  // 23.02.2026 in both languages, as on our invoices.
  const date = (d: Date | string) =>
    new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(typeof d === 'string' ? new Date(d) : d)
  const rateNumber = new Intl.NumberFormat(intl, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(invoice.vatRate))
  const rateShort = new Intl.NumberFormat(intl, { maximumFractionDigits: 2 }).format(
    Number(invoice.vatRate),
  )
  const percent = (n: string) => (locale === 'de' ? `${n} %` : `${n}%`)

  const { seller, buyer, lines } = invoice
  const logoImage = await brandLogo()
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 54, bottom: 100, left: 57, right: 58 },
    bufferPages: true,
    info: { Title: `${L.invoice} ${invoice.number}`, Author: seller.name },
  })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  const left = doc.page.margins.left
  const right = doc.page.width - doc.page.margins.right
  const width = right - left
  const half = width / 2
  const pageBottom = () => doc.page.height - doc.page.margins.bottom
  const hr = (at: number, color: string, weight: number) =>
    doc.moveTo(left, at).lineTo(right, at).lineWidth(weight).strokeColor(color).stroke()
  const body = (size = 9.5) => doc.font('Helvetica').fontSize(size).fillColor(INK)
  const bold = (size = 9.5) => doc.font('Helvetica-Bold').fontSize(size).fillColor(INK)

  /**
   * An amount in the current font. A leading € gets a hair of extra room:
   * Apple's Helvetica (Preview, Mail) draws it wider than its advance width,
   * so set flush it touches the first digit.
   */
  const euroGap = () => doc.widthOfString('€') * 0.3
  const moneyWidth = (n: number | string) => {
    const text = money(n)
    return text.startsWith('€')
      ? doc.widthOfString(text) + euroGap()
      : doc.widthOfString(text)
  }
  const drawMoney = (
    n: number | string,
    x: number,
    at: number,
    opts: { width?: number; align?: 'right' } = {},
  ) => {
    const text = money(n)
    const start =
      opts.align === 'right' && opts.width ? x + opts.width - moneyWidth(n) : x
    if (!text.startsWith('€')) {
      doc.text(text, start, at, { lineBreak: false })
      return
    }
    doc.text('€', start, at, { lineBreak: false })
    doc.text(text.slice(1), start + doc.widthOfString('€') + euroGap(), at, {
      lineBreak: false,
    })
  }

  // Logo, then our address line with the VAT id on the right.
  if (logoImage) {
    try {
      doc.image(logoImage, left, 50, { width: 120 })
    } catch {
      bold(20).text(BRAND.name, left, 52)
    }
  } else {
    bold(20).text(BRAND.name, left, 52)
  }
  body().text(
    [seller.name, seller.street, `${seller.zip} ${seller.city}`].join('  ·  '),
    left,
    82,
    { width: width * 0.68, lineBreak: false },
  )
  if (seller.vatId) {
    body().text(`${L.vatId}: ${seller.vatId}`, left + half, 82, {
      width: half,
      align: 'right',
    })
  }

  // Shipping address on the left, billing address on the right.
  const lineH = 17.3
  const addressLines = (a: InvoiceAddress, countryName: boolean) =>
    [
      a.name,
      a.company && a.company !== a.name ? a.company : null,
      a.street,
      a.line2,
      `${a.zip} ${a.city}`,
      countryName ? (COUNTRY[locale][a.country] ?? a.country) : a.country,
    ].filter(Boolean) as string[]

  const shipping: InvoiceAddress = buyer.shipping ?? {
    name: buyer.name,
    company: buyer.company,
    street: buyer.street,
    line2: buyer.line2,
    zip: buyer.zip,
    city: buyer.city,
    country: buyer.country,
  }
  const billing = [
    buyer.company,
    buyer.street,
    buyer.line2,
    `${buyer.zip} ${buyer.city}`,
    COUNTRY[locale][buyer.country] ?? buyer.country,
    buyer.vatId ? `${L.customerVat}: ${buyer.vatId}` : null,
  ].filter(Boolean) as string[]

  const addressTop = 118
  bold().text(L.shipping, left, addressTop, { width: half })
  bold().text(L.billing, left + half, addressTop, { width: half, align: 'right' })
  let ly = addressTop + lineH
  for (const line of addressLines(shipping, false)) {
    body().text(line, left, ly, { width: half - 10 })
    ly += lineH
  }
  let ry = addressTop + lineH
  for (const line of billing) {
    body().text(line, left + half + 10, ry, { width: half - 10, align: 'right' })
    ry += lineH
  }

  // The invoice facts: title and number on the left, dates and references in
  // a label / value table on the right.
  const factsTop = Math.max(ly, ry) + 15
  // Colons as on our invoices — which leave the one after the external order
  // number off.
  const meta: [string, string][] = [
    [`${L.documentDate}:`, date(invoice.issuedAt)],
    [
      `${L.deliveryDate}:`,
      buyer.deliveryDate ? date(buyer.deliveryDate) : date(invoice.issuedAt),
    ],
    [`${L.dueDate}:`, date(invoice.dueAt)],
    [`${L.orderNumber}:`, buyer.orderReference],
    ...(buyer.poNumber ? [[L.externalOrderNumber, buyer.poNumber] as [string, string]] : []),
  ]
  const metaLeft = left + width * 0.52
  meta.forEach(([label, value], i) => {
    const at = factsTop + i * lineH
    body().text(label, metaLeft, at, { width: 140 })
    body().text(value, metaLeft + 100, at, { width: right - metaLeft - 100, align: 'right' })
  })

  bold().text(L.invoice, left, factsTop)
  body().text(`${L.number}: ${invoice.number}`, left, factsTop + 23)

  // The note, in the left column under the number.
  const noteWidth = 220
  let y = factsTop + 59
  body().text(L.greeting, left, y, { width: noteWidth })
  y += 36
  body().text(L.thanks(BRAND.name), left, y, { width: noteWidth, lineGap: 7 })
  y = doc.y + 18
  body().text(L.regards, left, y, { width: noteWidth })
  y += 18
  body().text(L.team(BRAND.name), left, y, { width: noteWidth })
  y = Math.max(y + 31, factsTop + meta.length * lineH + 20)

  // The items, under a tinted header.
  const col = {
    pos: left + 6,
    qty: left + 47,
    sku: left + 85,
    name: left + 139,
    tax: left + 282,
    net: left + 351,
    total: left + 419,
  }
  const nameWidth = col.tax - col.name - 10
  const header = (at: number) => {
    doc.rect(left, at, width, 23).fill(TINT)
    bold().text(L.pos, col.pos, at + 7)
    bold().text(L.qty, col.qty, at + 7)
    bold().text(L.sku, col.sku, at + 7)
    bold().text(L.name, col.name, at + 7, { width: nameWidth })
    bold().text(L.taxValue, col.tax, at + 7)
    bold().text(L.netPrice, col.net, at + 7)
    bold().text(L.totalNet, col.total, at + 7)
    return at + 35
  }
  y = header(y)

  lines.forEach((line, i) => {
    // The name alone, as on our invoices; a box's contents stay on the row
    // (`details`) but are not printed.
    body()
    const rowHeight = Math.max(
      doc.heightOfString(line.description, { width: nameWidth }),
      12,
    )
    if (y + rowHeight > pageBottom() - 10) {
      doc.addPage()
      y = header(doc.page.margins.top)
    }
    body()
    doc.text(String(i + 1), col.pos, y)
    doc.text(String(line.quantity), col.qty, y)
    doc.text(line.sku ?? '', col.sku, y, { width: col.name - col.sku - 6 })
    doc.text(line.description, col.name, y, { width: nameWidth })
    doc.text(percent(rateNumber), col.tax, y)
    drawMoney(line.unitPrice, col.net, y)
    drawMoney(line.total, col.total, y)
    y += rowHeight + 14
  })
  y += 12

  // Totals between hairlines, label and figure tight against the right edge.
  if (y + 70 > pageBottom()) {
    doc.addPage()
    y = doc.page.margins.top
  }
  const totals: [string, string][] = [
    [L.sumNet, invoice.net],
    [L.vat(percent(rateShort)), invoice.vat],
    [L.total, invoice.gross],
  ]
  bold(11.5)
  const valueWidth = Math.max(...totals.map(([, v]) => moneyWidth(v)))
  const labelWidth = Math.max(...totals.map(([l]) => doc.widthOfString(l)))
  const labelLeft = right - 3 - valueWidth - 5 - labelWidth
  hr(y, RULE, 1)
  y += 6
  for (const [label, value] of totals) {
    bold(11.5).text(label, labelLeft, y, { lineBreak: false })
    drawMoney(value, right - 3 - valueWidth, y, { width: valueWidth, align: 'right' })
    y += 16
  }
  y += 4
  hr(y, RULE, 1)

  // Our address, contact and bank details in the footer of every page.
  const footer = [
    [seller.name, seller.street, `${seller.zip} ${seller.city}`],
    [
      seller.phone ? `${L.phone}: ${seller.phone}` : null,
      seller.email ? `${L.email}: ${seller.email}` : null,
      seller.website ? `${L.web}: ${seller.website}` : null,
    ],
    [seller.bankName, seller.iban, seller.bic],
  ].map((c) => c.filter(Boolean).join('\n'))

  const range = doc.bufferedPageRange()
  for (let p = range.start; p < range.start + range.count; p++) {
    doc.switchToPage(p)
    const top = doc.page.height - 84
    // Drawing inside the bottom margin; stop pdfkit adding a page for it.
    const bottom = doc.page.margins.bottom
    doc.page.margins.bottom = 0
    const xs = [left, left + 164, left + 355]
    footer.forEach((text, i) => {
      body().text(text, xs[i], top, {
        width: i === 2 ? right - xs[i] : 180,
        lineGap: 0.5,
      })
    })
    if (range.count > 1) {
      body(8)
        .fillColor(MUTED)
        .text(`${L.page} ${p + 1} / ${range.count}`, left, doc.page.height - 30, {
          width,
          align: 'right',
        })
    }
    doc.page.margins.bottom = bottom
  }

  doc.end()
  return done
}
