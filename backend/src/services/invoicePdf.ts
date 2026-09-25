import PDFDocument from 'pdfkit'
import type { Invoice } from '../db/schema/index.js'
import { BRAND } from '../emails/layout.js'

/**
 * An invoice as a PDF, drawn from the invoice row alone.
 *
 * Everything printed comes from what was copied onto the row when it was
 * issued, never from the live order or config — so the same invoice renders as
 * the same document however long after it went out.
 *
 * Laid out for a German B2B invoice (§14 UStG): both parties' names and
 * addresses, our tax id, the number and date, the delivery date, what was
 * supplied, net / VAT rate / VAT / gross, and how to pay. pdfkit's built-in
 * Helvetica covers € and umlauts, so no font files ship with the image.
 *
 * Styled after our HubSpot quotes, so the invoice reads as the same company as
 * the offer before it: the logo, an orange band with who it is for and the
 * facts, the items between orange rules, then the totals, terms and contact.
 */

type Locale = 'de' | 'en'

const LABELS = {
  de: {
    invoice: 'Rechnung',
    number: 'Rechnungsnummer',
    date: 'Rechnungsdatum',
    delivery: 'Lieferdatum',
    due: 'Fällig am',
    orderRef: 'Bestellung',
    poNumber: 'Ihre Bestellnummer',
    customerVat: 'Ihre USt-IdNr.',
    greeting: (name: string) => `Guten Tag ${name},`,
    intro: (ref: string) =>
      `vielen Dank für Ihren Auftrag ${ref}. Für die folgenden Produkte und Leistungen stellen wir Ihnen in Rechnung:`,
    items: 'Produkte & Services',
    description: 'Artikel & Beschreibung',
    qty: 'Menge',
    unit: 'Einzelpreis',
    total: 'Gesamt',
    net: 'Zwischensumme (netto)',
    vat: 'Umsatzsteuer',
    gross: 'Rechnungsbetrag',
    paymentTerms: 'Zahlungsbedingungen',
    paymentTerm: (days: number) =>
      days <= 0
        ? 'Überweisung, zahlbar sofort nach Erhalt der Rechnung.'
        : `Überweisung (Zahlungsziel: ${days} ${days === 1 ? 'Tag' : 'Tage'} ab Rechnungsdatum).`,
    payment: (amount: string, due: string) =>
      `Bitte überweisen Sie den Rechnungsbetrag von ${amount} bis zum ${due} unter Angabe der Rechnungsnummer auf das folgende Konto:`,
    payee: 'Empfänger',
    reference: 'Verwendungszweck',
    conditions: 'Kaufbedingungen',
    terms: 'Es gelten unsere Allgemeinen Geschäftsbedingungen:',
    questions: 'Bei Fragen stehen wir jederzeit zur Verfügung.',
    vatId: 'USt-IdNr.',
    taxNumber: 'Steuernummer',
    directors: 'Geschäftsführung',
    register: 'Registergericht',
    bank: 'Bank',
    attention: 'z. Hd.',
    page: 'Seite',
  },
  en: {
    invoice: 'Invoice',
    number: 'Invoice number',
    date: 'Invoice date',
    delivery: 'Delivery date',
    due: 'Due date',
    orderRef: 'Order',
    poNumber: 'Your PO number',
    customerVat: 'Your VAT ID',
    greeting: (name: string) => `Hello ${name},`,
    intro: (ref: string) =>
      `thank you for your order ${ref}. We are invoicing you for the following products and services:`,
    items: 'Products & services',
    description: 'Item & description',
    qty: 'Qty',
    unit: 'Unit price',
    total: 'Total',
    net: 'Subtotal (net)',
    vat: 'VAT',
    gross: 'Total due',
    paymentTerms: 'Payment terms',
    paymentTerm: (days: number) =>
      days <= 0
        ? 'Bank transfer, payable immediately on receipt.'
        : `Bank transfer (payment due within ${days} ${days === 1 ? 'day' : 'days'} of the invoice date).`,
    payment: (amount: string, due: string) =>
      `Please transfer ${amount} by ${due}, quoting the invoice number, to the following account:`,
    payee: 'Payee',
    reference: 'Reference',
    conditions: 'Terms of sale',
    terms: 'Our general terms and conditions apply:',
    questions: 'If you have any questions, we are always happy to help.',
    vatId: 'VAT ID',
    taxNumber: 'Tax number',
    directors: 'Managing directors',
    register: 'Register court',
    bank: 'Bank',
    attention: 'Attn.',
    page: 'Page',
  },
} as const

const COUNTRY: Record<string, string> = { DE: 'Deutschland' }

// The quote's palette: brand orange, HubSpot's slate for text, its hairlines.
const ORANGE = '#FF522A'
const INK = '#33475B'
const MUTED = '#7C98B6'
const RULE = '#DFE3EB'
const TERMS_URL = 'https://biglittlethings.de/allgemeine-geschaeftsbedingungen/'

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
  const intl = locale === 'de' ? 'de-DE' : 'en-GB'
  const money = (n: number | string) =>
    new Intl.NumberFormat(intl, { style: 'currency', currency: invoice.currency }).format(
      Number(n),
    )
  const date = (d: Date | string) =>
    new Intl.DateTimeFormat(intl, { day: '2-digit', month: 'long', year: 'numeric' }).format(
      typeof d === 'string' ? new Date(d) : d,
    )
  const rate = new Intl.NumberFormat(intl, { maximumFractionDigits: 2 }).format(
    Number(invoice.vatRate),
  )

  const { seller, buyer, lines } = invoice
  // From the invoice's own dates: the due date may have been set by hand.
  const calendarDay = (d: Date | string) => {
    const at = new Date(d)
    return Date.UTC(at.getFullYear(), at.getMonth(), at.getDate())
  }
  const termDays = Math.round(
    (calendarDay(invoice.dueAt) - calendarDay(invoice.issuedAt)) / 86_400_000,
  )
  const logoImage = await brandLogo()
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 95, left: 56, right: 56 },
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
  const pageBottom = () => doc.page.height - doc.page.margins.bottom
  const hr = (at: number, color: string, weight: number, from = left, to = right) =>
    doc.moveTo(from, at).lineTo(to, at).lineWidth(weight).strokeColor(color).stroke()

  // Logo on white, as on the quote.
  if (logoImage) {
    try {
      doc.image(logoImage, left, 24, { height: 30 })
    } catch {
      doc.font('Helvetica-Bold').fontSize(20).fillColor(INK).text(BRAND.name, left, 26)
    }
  } else {
    doc.font('Helvetica-Bold').fontSize(20).fillColor(INK).text(BRAND.name, left, 26)
  }

  // The orange band: the title, who it is for, and the invoice facts.
  const bandTop = 70
  const title = `${L.invoice} ${invoice.number}`
  const buyerLines = [
    buyer.street,
    buyer.line2,
    `${buyer.zip} ${buyer.city}`,
    COUNTRY[buyer.country] ?? buyer.country,
  ].filter(Boolean) as string[]
  const contactLines = [
    buyer.name ? `${L.attention} ${buyer.name}` : null,
    buyer.email,
  ].filter(Boolean) as string[]
  const meta: string[] = [
    `${L.number}: ${invoice.number}`,
    `${L.date}: ${date(invoice.issuedAt)}`,
    `${L.delivery}: ${buyer.deliveryDate ? date(buyer.deliveryDate) : date(invoice.issuedAt)}`,
    `${L.due}: ${date(invoice.dueAt)}`,
    `${L.orderRef}: ${buyer.orderReference}`,
    ...(buyer.poNumber ? [`${L.poNumber}: ${buyer.poNumber}`] : []),
    ...(buyer.vatId ? [`${L.customerVat}: ${buyer.vatId}`] : []),
  ]

  const colWidth = width / 2 - 10
  doc.font('Helvetica-Bold').fontSize(20)
  const titleHeight = doc.heightOfString(title, { width })
  doc.font('Helvetica').fontSize(9)
  const lineH = doc.currentLineHeight(true) + 3
  const leftHeight =
    lineH * (1 + buyerLines.length) + (contactLines.length ? 12 + lineH * contactLines.length : 0)
  const rightHeight = lineH * meta.length
  const factsTop = bandTop + 28 + titleHeight + 16
  const bandHeight = factsTop - bandTop + Math.max(leftHeight, rightHeight) + 20

  doc.rect(0, bandTop, doc.page.width, bandHeight).fill(ORANGE)
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#FFFFFF').text(title, left, bandTop + 28, {
    width,
  })

  let ly = factsTop
  doc.font('Helvetica-Bold').fontSize(9).text(buyer.company, left, ly, { width: colWidth })
  ly += lineH
  doc.font('Helvetica')
  for (const line of buyerLines) {
    doc.text(line, left, ly, { width: colWidth })
    ly += lineH
  }
  if (contactLines.length) {
    ly += 12
    contactLines.forEach((line, i) => {
      doc.font(i === 0 && buyer.name ? 'Helvetica-Bold' : 'Helvetica')
      doc.text(line, left, ly, { width: colWidth })
      ly += lineH
    })
  }
  let ry = factsTop
  doc.font('Helvetica')
  for (const line of meta) {
    doc.text(line, right - colWidth, ry, { width: colWidth, align: 'right' })
    ry += lineH
  }

  // The greeting, framed like the quote's cover note.
  let y = bandTop + bandHeight + 22
  const noteText = [
    L.greeting(buyer.name || buyer.company),
    '',
    L.intro(buyer.orderReference),
  ].join('\n')
  doc.font('Helvetica').fontSize(9.5)
  const noteHeight = doc.heightOfString(noteText, { width: width - 32, lineGap: 3 })
  doc.rect(left, y, width, noteHeight + 26).lineWidth(0.75).strokeColor(INK).stroke()
  doc.fillColor(INK).text(noteText, left + 16, y + 13, { width: width - 32, lineGap: 3 })
  y += noteHeight + 26 + 24

  // Items between orange rules.
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(L.items, left, y)
  y = doc.y + 10
  const col = {
    desc: left,
    qty: right - 190,
    unit: right - 130,
    total: right - 70,
  }
  const descWidth = col.qty - col.desc - 16
  const header = (at: number) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK)
    doc.text(L.description, col.desc, at, { width: descWidth })
    doc.text(L.qty, col.qty, at, { width: 45, align: 'right' })
    doc.text(L.unit, col.unit, at, { width: 60, align: 'right' })
    doc.text(L.total, col.total, at, { width: 70, align: 'right' })
    hr(at + 18, ORANGE, 1.5)
    return at + 30
  }
  y = header(y)

  lines.forEach((line, i) => {
    doc.font('Helvetica').fontSize(9.5)
    const nameHeight = doc.heightOfString(line.description, { width: descWidth })
    const detailsHeight = line.details
      ? doc.font('Helvetica').fontSize(8).heightOfString(line.details, { width: descWidth, lineGap: 2 }) + 4
      : 0
    const rowHeight = nameHeight + detailsHeight
    if (y + rowHeight > pageBottom() - 10) {
      doc.addPage()
      y = header(doc.page.margins.top)
    }
    doc.font('Helvetica').fontSize(9.5).fillColor(INK)
    doc.text(line.description, col.desc, y, { width: descWidth })
    doc.text(String(line.quantity), col.qty, y, { width: 45, align: 'right' })
    doc.text(money(line.unitPrice), col.unit, y, { width: 60, align: 'right' })
    doc.text(money(line.total), col.total, y, { width: 70, align: 'right' })
    if (line.details) {
      doc
        .fontSize(8)
        .fillColor(MUTED)
        .text(line.details, col.desc, y + nameHeight + 4, { width: descWidth, lineGap: 2 })
    }
    y += rowHeight + 11
    if (i < lines.length - 1) {
      hr(y - 5, RULE, 0.75)
      y += 6
    }
  })
  hr(y, ORANGE, 1.5)
  y += 14

  // Totals, right-aligned under the table.
  if (y + 90 > pageBottom()) {
    doc.addPage()
    y = doc.page.margins.top
  }
  const tLeft = right - 240
  const totalRow = (label: string, value: string, sub?: string) => {
    doc.font('Helvetica').fontSize(9.5).fillColor(INK)
    doc.text(label, tLeft, y, { width: 150 })
    doc.text(value, right - 100, y, { width: 100, align: 'right' })
    y += 14
    if (sub) {
      doc.fontSize(8).fillColor(MUTED).text(sub, right - 100, y, { width: 100, align: 'right' })
      y += 12
    }
    y += 4
    hr(y, RULE, 0.75, tLeft, right)
    y += 10
  }
  totalRow(L.net, money(invoice.net))
  totalRow(L.vat, money(invoice.vat), `${rate} %`)
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK)
  doc.text(L.gross, tLeft, y, { width: 150, align: 'right' })
  doc.text(money(invoice.gross), right - 100, y, { width: 100, align: 'right' })
  y += 40

  // Terms, payment and who to ask — the quote's closing, in the same order.
  const section = (heading: string, draw: () => void, needs: number) => {
    if (y + needs > pageBottom()) {
      doc.addPage()
      y = doc.page.margins.top
    }
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK).text(heading, left, y, { width })
    doc.moveDown(0.6)
    draw()
    y = doc.y + 20
  }

  section(
    L.paymentTerms,
    () => {
      doc.font('Helvetica').fontSize(8.5).fillColor(INK)
      doc.text(L.paymentTerm(termDays), { width, lineGap: 2 })
      doc.text(L.payment(money(invoice.gross), date(invoice.dueAt)), { width, lineGap: 2 })
      doc.moveDown(0.5)
      const bank: [string, string | null | undefined][] = [
        [L.payee, seller.name],
        ['IBAN', seller.iban],
        ['BIC', seller.bic],
        [L.bank, seller.bankName],
        [L.reference, invoice.number],
      ]
      for (const [label, value] of bank) {
        if (!value) continue
        const at = doc.y
        doc.fillColor(MUTED).text(label, left, at, { width: 100 })
        doc.fillColor(INK).text(value, left + 100, at, { width: width - 100 })
      }
    },
    130,
  )

  section(
    L.conditions,
    () => {
      doc.font('Helvetica').fontSize(8.5).fillColor(INK)
      doc.text(`${L.terms} `, { width, continued: true })
      doc.fillColor(ORANGE).text(TERMS_URL.replace(/^https:\/\//, ''), {
        link: TERMS_URL,
        underline: true,
      })
    },
    50,
  )

  if (y + 110 > pageBottom()) {
    doc.addPage()
    y = doc.page.margins.top
  }
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(L.questions, left, y, { width })
  doc.moveDown(0.8)
  doc
    .font('Helvetica')
    .fontSize(9.5)
    .text(
      [
        seller.name,
        seller.street,
        `${seller.zip} ${seller.city}`,
        seller.country,
        '',
        seller.email,
        seller.phone,
      ]
        .filter((l) => l !== null && l !== undefined)
        .join('\n'),
      { width, lineGap: 2 },
    )

  // Legal footer on every page.
  const footer = [
    [
      seller.name,
      seller.street,
      `${seller.zip} ${seller.city}`,
      seller.website,
    ],
    [
      seller.managingDirectors ? `${L.directors}: ${seller.managingDirectors}` : null,
      seller.registerCourt ? `${L.register}: ${seller.registerCourt}` : null,
      seller.registerNumber,
      seller.vatId ? `${L.vatId}: ${seller.vatId}` : null,
      seller.taxNumber ? `${L.taxNumber}: ${seller.taxNumber}` : null,
    ],
    [
      seller.bankName ? `${L.bank}: ${seller.bankName}` : null,
      seller.iban ? `IBAN: ${seller.iban}` : null,
      seller.bic ? `BIC: ${seller.bic}` : null,
    ],
  ].map((c) => c.filter(Boolean).join('\n'))

  const range = doc.bufferedPageRange()
  for (let p = range.start; p < range.start + range.count; p++) {
    doc.switchToPage(p)
    const top = doc.page.height - 80
    // Drawing inside the bottom margin; stop pdfkit adding a page for it.
    const bottom = doc.page.margins.bottom
    doc.page.margins.bottom = 0
    hr(top - 10, RULE, 0.75)
    const footerCol = width / 3
    footer.forEach((text, i) => {
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(MUTED)
        .text(text, left + i * footerCol, top, { width: footerCol - 10, lineGap: 1.5 })
    })
    if (range.count > 1) {
      doc.text(`${L.page} ${p + 1} / ${range.count}`, left, doc.page.height - 28, {
        width,
        align: 'right',
      })
    }
    doc.rect(0, doc.page.height - 6, doc.page.width, 6).fill(ORANGE)
    doc.page.margins.bottom = bottom
  }

  doc.end()
  return done
}
