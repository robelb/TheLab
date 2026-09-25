/**
 * Getting a request out of the app.
 *
 * Two shapes, because two people want different things. The CSV is a flat list
 * of things to actually order — a box is exploded into its contents, since a
 * supplier buys mugs and boxes, not "one gift box". The JSON is the whole
 * record including every placement, for anyone who needs to reproduce the
 * artwork rather than just buy the parts.
 *
 * No dependency: a request is a handful of rows, and shipping a CSV library to
 * join strings would be silly.
 */

import type { Order, OrderItem } from '@/api/orders'
import type { BoxLine } from '@/types/box'

/** RFC 4180: quote everything, double any inner quote. Safe for Excel. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '""'
  return `"${String(value).replace(/"/g, '""')}"`
}

const COLUMNS = [
  'reference',
  'requested_by',
  'email',
  'delivery_date',
  'line',
  'part_of',
  'sku',
  'name',
  'quantity',
  'unit_price',
  'line_total',
  'currency',
  'has_design',
  'print_brief',
  'artwork_url',
] as const

interface Row {
  line: number
  partOf: string
  sku: string
  name: string
  quantity: number
  unitPrice: number
  hasDesign: boolean
  printBrief: string
  artwork: string
}

/**
 * One row per orderable thing.
 *
 * A box contributes no row of its own — its price is the sum of its contents,
 * so a row for the box plus rows for the contents would double the total. The
 * `part_of` column is what ties the contents back to it.
 */
function rowsFor(item: OrderItem, index: number): Row[] {
  const line = index + 1

  if (!item.box) {
    return [
      {
        line,
        partOf: '',
        sku: item.sku ?? '',
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        hasDesign: Boolean(item.design?.layout || item.design?.prompt),
        printBrief: item.design?.prompt ?? '',
        artwork: item.design?.flat ?? item.image ?? '',
      },
    ]
  }

  const parts: (BoxLine | null | undefined)[] = [
    ...item.box.lines,
    item.box.packaging,
    item.box.filling,
  ]
  return parts.filter((p): p is BoxLine => Boolean(p)).map((part) => {
    const design = item.box?.designs?.[part.productId]
    return {
      line,
      partOf: item.name,
      sku: part.productId,
      name: part.name,
      // Box quantity multiplies everything inside it.
      quantity: part.quantity * item.quantity,
      unitPrice: part.price,
      hasDesign: Boolean(design?.layout || part.customPrint),
      printBrief: design?.prompt ?? item.box?.packagingPrompt ?? '',
      artwork: part.customizedImage ?? design?.flat ?? part.image ?? '',
    }
  })
}

export function orderToCsv(order: Order): string {
  const lines = [COLUMNS.map(cell).join(',')]
  order.items.forEach((item, i) => {
    for (const r of rowsFor(item, i)) {
      lines.push(
        [
          order.reference,
          order.contact.name,
          order.contact.email,
          order.delivery?.neededBy ?? '',
          r.line,
          r.partOf,
          r.sku,
          r.name,
          r.quantity,
          r.unitPrice.toFixed(2),
          (r.unitPrice * r.quantity).toFixed(2),
          order.currency,
          r.hasDesign ? 'yes' : 'no',
          r.printBrief,
          r.artwork,
        ]
          .map(cell)
          .join(','),
      )
    }
  })
  return lines.join('\r\n')
}

/** The whole record, placements included. */
export function orderToJson(order: Order): string {
  return JSON.stringify(order, null, 2)
}

export function downloadText(
  filename: string,
  contents: string,
  type: string,
): void {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // Revoking immediately can cancel the download in some browsers; a tick is
  // enough for the click to have been handed off.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
