import PDFDocument from 'pdfkit'
import type { Invoice } from '../db/schema/index.js'

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
 */

type Locale = 'de' | 'en'

const LABELS = {
  de: {
    invoice: 'Rechnung',
    number: 'Rechnungsnummer',
    date: 'Rechnungsdatum',
    delivery: 'Lieferdatum',
    deliveryIsInvoiceDate: 'Das Lieferdatum entspricht dem Rechnungsdatum.',
    orderRef: 'Bestellung',
    poNumber: 'Ihre Bestellnummer',
    customerVat: 'Ihre USt-IdNr.',
    pos: 'Pos.',
    description: 'Beschreibung',
    qty: 'Menge',
    unit: 'Einzelpreis',
    total: 'Gesamt',
    net: 'Nettobetrag',
    vat: (rate: string) => `zzgl. USt. ${rate} %`,
    gross: 'Rechnungsbetrag',
    payment: (amount: string, due: string) =>
      `Bitte überweisen Sie den Rechnungsbetrag von ${amount} bis zum ${due} unter Angabe der Rechnungsnummer auf das unten genannte Konto.`,
    thanks: 'Vielen Dank für Ihren Auftrag.',
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
    deliveryIsInvoiceDate: 'The delivery date is the invoice date.',
    orderRef: 'Order',
    poNumber: 'Your PO number',
    customerVat: 'Your VAT ID',
    pos: 'No.',
    description: 'Description',
    qty: 'Qty',
    unit: 'Unit price',
    total: 'Total',
    net: 'Net amount',
    vat: (rate: string) => `VAT ${rate} %`,
    gross: 'Total due',
    payment: (amount: string, due: string) =>
      `Please transfer ${amount} by ${due}, quoting the invoice number, to the account below.`,
    thanks: 'Thank you for your order.',
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

export async function renderInvoicePdf(invoice: Invoice): Promise<Buffer> {
  const locale: Locale = invoice.locale === 'en' ? 'en' : 'de'
  const L = LABELS[locale]
  const intl = locale === 'de' ? 'de-DE' : 'en-GB'
  const money = (n: number | string) =>
    new Intl.NumberFormat(intl, { style: 'currency', currency: invoice.currency }).format(
      Number(n),
    )
  const date = (d: Date | string) =>
    new Intl.DateTimeFormat(intl, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
      typeof d === 'string' ? new Date(d) : d,
    )
  const rate = new Intl.NumberFormat(intl, { maximumFractionDigits: 2 }).format(
    Number(invoice.vatRate),
  )

  const { seller, buyer, lines } = invoice
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 110, left: 56, right: 56 },
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
  const grey = '#666666'

  // Our block, top right.
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#000').text(seller.name, left, 50, {
    width,
    align: 'right',
  })
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(grey)
    .text(
      [
        seller.street,
        `${seller.zip} ${seller.city}`,
        seller.country,
        seller.phone,
        seller.email,
        seller.website,
      ]
        .filter(Boolean)
        .join('\n'),
      { width, align: 'right' },
    )

  // The window-envelope sender line, then the buyer.
  const addressTop = 150
  doc
    .fontSize(7)
    .fillColor(grey)
    .text(`${seller.name} · ${seller.street} · ${seller.zip} ${seller.city}`, left, addressTop, {
      width: 260,
      underline: true,
    })
  doc
    .fontSize(10)
    .fillColor('#000')
    .text(
      [
        buyer.company,
        buyer.name ? `${L.attention} ${buyer.name}` : null,
        buyer.street,
        buyer.line2,
        `${buyer.zip} ${buyer.city}`,
        COUNTRY[buyer.country] ?? buyer.country,
      ]
        .filter(Boolean)
        .join('\n'),
      left,
      addressTop + 14,
      { width: 260 },
    )

  // Invoice facts, right column beside the address.
  const meta: [string, string][] = [
    [L.number, invoice.number],
    [L.date, date(invoice.issuedAt)],
  ]
  if (buyer.deliveryDate) meta.push([L.delivery, date(buyer.deliveryDate)])
  meta.push([L.orderRef, buyer.orderReference])
  if (buyer.poNumber) meta.push([L.poNumber, buyer.poNumber])
  if (buyer.vatId) meta.push([L.customerVat, buyer.vatId])

  let metaY = addressTop
  const metaX = left + 300
  for (const [label, value] of meta) {
    doc.fontSize(9).fillColor(grey).text(label, metaX, metaY, { width: 100 })
    doc.fillColor('#000').text(value, metaX + 100, metaY, { width: right - metaX - 100, align: 'right' })
    metaY += 14
  }

  // Title.
  let y = Math.max(metaY, doc.y) + 40
  doc.font('Helvetica-Bold').fontSize(16).text(`${L.invoice} ${invoice.number}`, left, y)
  y = doc.y + 6
  doc.font('Helvetica').fontSize(9).fillColor(grey)
  if (!buyer.deliveryDate) {
    doc.text(L.deliveryIsInvoiceDate, left, y)
    y = doc.y
  }
  y += 14

  // Line items.
  const col = {
    pos: left,
    desc: left + 30,
    qty: right - 190,
    unit: right - 140,
    total: right - 70,
  }
  const header = (at: number) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000')
    doc.text(L.pos, col.pos, at, { width: 28 })
    doc.text(L.description, col.desc, at, { width: col.qty - col.desc - 8 })
    doc.text(L.qty, col.qty, at, { width: 45, align: 'right' })
    doc.text(L.unit, col.unit, at, { width: 65, align: 'right' })
    doc.text(L.total, col.total, at, { width: 70, align: 'right' })
    doc
      .moveTo(left, at + 14)
      .lineTo(right, at + 14)
      .lineWidth(0.5)
      .strokeColor('#999')
      .stroke()
    return at + 20
  }
  y = header(y)

  const pageBottom = () => doc.page.height - doc.page.margins.bottom
  lines.forEach((line, i) => {
    const descWidth = col.qty - col.desc - 8
    doc.font('Helvetica').fontSize(9)
    const descHeight =
      doc.heightOfString(line.description, { width: descWidth }) +
      (line.details
        ? doc.fontSize(8).heightOfString(line.details, { width: descWidth }) + 2
        : 0)
    if (y + descHeight > pageBottom() - 10) {
      doc.addPage()
      y = header(doc.page.margins.top)
    }
    doc.font('Helvetica').fontSize(9).fillColor('#000')
    doc.text(String(i + 1), col.pos, y, { width: 28 })
    doc.text(line.description, col.desc, y, { width: descWidth })
    if (line.details) {
      doc.fontSize(8).fillColor(grey).text(line.details, col.desc, doc.y + 2, { width: descWidth })
      doc.fontSize(9).fillColor('#000')
    }
    doc.text(String(line.quantity), col.qty, y, { width: 45, align: 'right' })
    doc.text(money(line.unitPrice), col.unit, y, { width: 65, align: 'right' })
    doc.text(money(line.total), col.total, y, { width: 70, align: 'right' })
    y += descHeight + 8
  })

  // Totals.
  if (y + 90 > pageBottom()) {
    doc.addPage()
    y = doc.page.margins.top
  }
  doc
    .moveTo(col.unit - 60, y)
    .lineTo(right, y)
    .lineWidth(0.5)
    .strokeColor('#999')
    .stroke()
  y += 8
  const totalRow = (label: string, value: string, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 9).fillColor('#000')
    doc.text(label, col.unit - 120, y, { width: 180, align: 'right' })
    doc.text(value, col.total, y, { width: 70, align: 'right' })
    y += bold ? 18 : 14
  }
  totalRow(L.net, money(invoice.net))
  totalRow(L.vat(rate), money(invoice.vat))
  totalRow(L.gross, money(invoice.gross), true)

  // How to pay.
  y += 20
  doc
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor('#000')
    .text(L.payment(money(invoice.gross), date(invoice.dueAt)), left, y, { width })
  doc.moveDown(1).text(L.thanks, { width })

  // Legal footer on every page.
  const footer = [
    [
      seller.name,
      seller.street,
      `${seller.zip} ${seller.city}`,
      seller.managingDirectors ? `${L.directors}: ${seller.managingDirectors}` : null,
    ],
    [
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
    const top = doc.page.height - 90
    // Drawing inside the bottom margin; stop pdfkit adding a page for it.
    const bottom = doc.page.margins.bottom
    doc.page.margins.bottom = 0
    doc
      .moveTo(left, top - 8)
      .lineTo(right, top - 8)
      .lineWidth(0.5)
      .strokeColor('#ccc')
      .stroke()
    const colWidth = width / 3
    footer.forEach((text, i) => {
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(grey)
        .text(text, left + i * colWidth, top, { width: colWidth - 8 })
    })
    if (range.count > 1) {
      doc.text(`${L.page} ${p + 1} / ${range.count}`, left, doc.page.height - 30, {
        width,
        align: 'right',
      })
    }
    doc.page.margins.bottom = bottom
  }

  doc.end()
  return done
}
