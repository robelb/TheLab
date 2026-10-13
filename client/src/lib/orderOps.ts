import type { Order, OrderItem } from '@/api/orders'
import type { BoxDetails, BoxLine } from '@/types/box'
import { PICK_FEE_FIRST, PICK_FEE_NEXT, pickFee } from '@/lib/pricing'
import { SHIPPING_RATES, zoneFor, type ShippingZone } from '@/lib/shipping'
import { formatDate } from '@/utils/format'

/**
 * What the operations team still has to do on a request, worked out from the
 * request itself — the same list drives the chips in the orders table and the
 * checklist on the request page, so the two can never disagree.
 */

export type OrderTodoKey =
  | 'confirm'
  | 'dueSoon'
  | 'addresses'
  | 'stickerLogo'
  | 'cardMessage'
  | 'customDesign'
  | 'payment'

export interface OrderTodo {
  key: OrderTodoKey
  label: string
  /** What exactly, for the checklist on the request page. */
  detail: string
  /** Red rather than amber: the date is close, so this one comes first. */
  urgent?: boolean
}

/** Supplies whose artwork is agreed with the customer after the request. */
const isCustomDesign = (name: string | undefined) => /eigenes design/i.test(name ?? '')

export function boxesOf(order: Order): BoxDetails[] {
  return order.items
    .map((item) => item.box)
    .filter((box): box is BoxDetails => Boolean(box))
}

/** Gift boxes in the request, counting each box line's quantity. */
export function boxCount(order: Order): number {
  return order.items.reduce((sum, item) => sum + (item.box ? item.quantity : 0), 0)
}

/** "50 boxes", "3 items", "50 boxes + 2 items". */
export function orderSize(order: Order): string {
  const boxes = boxCount(order)
  const loose = order.items.reduce((sum, item) => sum + (item.box ? 0 : item.quantity), 0)
  const parts = [
    boxes ? `${boxes} ${boxes === 1 ? 'box' : 'boxes'}` : '',
    loose ? `${loose} ${loose === 1 ? 'item' : 'items'}` : '',
  ].filter(Boolean)
  return parts.join(' + ') || '—'
}

/** Whole days from today until the delivery date; negative once it has passed. */
export function daysUntilDelivery(order: Order, now = new Date()): number | null {
  const neededBy = order.delivery?.neededBy
  if (!neededBy) return null
  const due = new Date(`${neededBy}T00:00:00`)
  if (Number.isNaN(due.getTime())) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((due.getTime() - today.getTime()) / 86_400_000)
}

/** Requests whose delivery date is this close are flagged. */
export const DUE_SOON_DAYS = 14

export function orderTodos(order: Order, now = new Date()): OrderTodo[] {
  if (order.status === 'cancelled') return []
  const todos: OrderTodo[] = []
  const boxes = boxesOf(order)
  const open = order.status === 'new' || order.status === 'quoted'

  const days = daysUntilDelivery(order, now)
  if (open && days !== null && days <= DUE_SOON_DAYS) {
    todos.push({
      key: 'dueSoon',
      label: days < 0 ? 'Date passed' : `Due in ${days}d`,
      detail:
        days < 0
          ? `The delivery date was ${-days} days ago and the request is not confirmed yet.`
          : `Needed in ${days} days and not confirmed yet.`,
      urgent: true,
    })
  }
  if (order.status === 'new') {
    todos.push({
      key: 'confirm',
      label: 'Price & confirm',
      detail: 'Check the price and shipping, then confirm to issue the invoice.',
    })
  }
  if (order.addressesLater) {
    todos.push({
      key: 'addresses',
      label: 'Addresses',
      detail: 'Recipient addresses for individually sent boxes are still to come.',
    })
  }
  const missingLogo = boxes.filter((box) => box.stickers && !box.stickerLogo?.url).length
  if (missingLogo) {
    todos.push({
      key: 'stickerLogo',
      label: 'Sticker logo',
      detail: `The logo for the stickers has not been sent${missingLogo > 1 ? ` (${missingLogo} boxes)` : ''}.`,
    })
  }
  const missingMessage = boxes.filter(
    (box) => box.greetingCard && !box.greetingCard.message?.trim(),
  ).length
  if (missingMessage) {
    todos.push({
      key: 'cardMessage',
      label: 'Card message',
      detail: `The greeting card text is still to come${missingMessage > 1 ? ` (${missingMessage} boxes)` : ''}.`,
    })
  }
  const custom = boxes.flatMap((box) =>
    [box.packaging, box.greetingCard, box.stickers]
      .filter((line) => line && isCustomDesign(line.name))
      .map((line) => line!.name),
  )
  if (custom.length) {
    todos.push({
      key: 'customDesign',
      label: 'Custom design',
      detail: `Agree the artwork for: ${[...new Set(custom)].join(', ')}.`,
    })
  }
  if (order.invoice && order.paymentStatus !== 'paid') {
    todos.push({
      key: 'payment',
      label: 'Awaiting payment',
      detail: `Invoice ${order.invoice.number} is due ${formatDate(order.invoice.dueAt)}.`,
    })
  }
  return todos
}

/** Free-text search over what someone would type to find a request. */
export function matchesSearch(order: Order, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [
    order.reference,
    order.contact.name,
    order.contact.email,
    order.contact.company,
    order.contact.phone,
    order.billing?.company,
    order.billing?.email,
    order.billing?.poNumber,
    order.billing?.vatId,
    order.invoice?.number,
    order.collectionName,
  ].some((value) => value?.toLowerCase().includes(q))
}

/** A country's name for an ISO code, in English for the dashboard. */
export function countryName(code: string | null | undefined): string {
  if (!code) return '—'
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

export const SHIPPING_LABEL: Record<string, string> = {
  bulk: 'Bulk',
  individual: 'Individual',
  mixed: 'Mixed',
}

// ---------------------------------------------------------------------------
// How a price was reached — the same rules the server priced with, spelled
// out so the team can check a request line by line.
// ---------------------------------------------------------------------------

export interface CalcRow {
  label: string
  /** The working, e.g. "50 boxes × €2.00". */
  detail?: string
  amount: number
}

export interface Calc {
  rows: CalcRow[]
  /** Anything the rows cannot show, e.g. a price changed on confirmation. */
  note?: string
}

type Money = (n: number) => string

const round2 = (n: number) => Math.round(n * 100) / 100
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Items picked into one box: every product unit, the card, the stickers. */
export function picksOf(box: BoxDetails): number {
  const units = (line: { quantity: number } | null | undefined) => line?.quantity ?? 0
  return (
    box.lines.reduce((sum, line) => sum + line.quantity, 0) +
    units(box.greetingCard) +
    units(box.stickers)
  )
}

/** "€0.30 + 5 × €0.15" for 6 picks. */
export function pickFeeWorking(picks: number, money: Money): string {
  if (picks <= 1) return `${plural(picks, 'item', 'items')} · first item ${money(PICK_FEE_FIRST)}`
  return `${picks} items · ${money(PICK_FEE_FIRST)} first + ${picks - 1} × ${money(PICK_FEE_NEXT)}`
}

/**
 * How one box on a request got its price per box.
 *
 * - A ready-made box kept as sold costs its set price (or its volume price),
 *   contents and packing included.
 * - A built box is its contents at list price plus the pick fee, less any
 *   volume prices — worked out as the difference to what the server charged,
 *   so the rows always add up to the stored price.
 * - Requests from before server pricing summed their contents and nothing else.
 */
export function boxPriceCalc(item: OrderItem, money: Money): Calc | null {
  const box = item.box
  if (!box) return null
  const boxes = plural(item.quantity, 'box', 'boxes')

  if (item.pricingMode === 'bundle') {
    const rows: CalcRow[] = []
    if (item.tierPrice !== undefined && box.bundlePrice != null) {
      rows.push({ label: 'Set price', amount: box.bundlePrice })
      rows.push({
        label: `Volume price for ${boxes}`,
        amount: round2(item.unitPrice - box.bundlePrice),
      })
    } else {
      rows.push({
        label: item.tierPrice !== undefined ? `Volume price for ${boxes}` : 'Set price',
        amount: item.unitPrice,
      })
    }
    return {
      rows,
      note: 'Ready-made box taken as sold: contents and packing are included in its price, no pick fee on top.',
    }
  }

  const parts: BoxLine[] = [
    ...box.lines,
    box.packaging,
    box.filling,
    box.greetingCard,
    box.stickers,
  ].filter((p): p is BoxLine => Boolean(p))
  const list = round2(parts.reduce((sum, p) => sum + p.price * p.quantity, 0))

  if (!item.pricingMode) {
    return {
      rows: [{ label: 'Contents at list price', amount: list }],
      note: 'Priced before pick fees and volume prices were added.',
    }
  }

  const picks = picksOf(box)
  const fee = pickFee(picks)
  const rows: CalcRow[] = [
    { label: 'Contents at list price', detail: plural(parts.length, 'part', 'parts'), amount: list },
    { label: 'Pick fee', detail: pickFeeWorking(picks, money), amount: fee },
  ]
  const adjustment = round2(item.unitPrice - list - fee)
  if (Math.abs(adjustment) >= 0.01) {
    rows.push({
      label: adjustment < 0 ? 'Volume prices' : 'Adjustment',
      detail:
        adjustment < 0
          ? `tiers for ${boxes} (units per box × boxes)`
          : 'list prices changed since the box was built',
      amount: adjustment,
    })
  }
  return { rows }
}

const ZONE_LABEL: Record<ShippingZone, string> = {
  DE: 'Germany',
  ZONE_1: 'EU zone 1',
  ZONE_1_NON_EU: 'zone 1 (non-EU)',
  ZONE_2: 'EU zone 2',
  ZONE_2_NON_EU: 'zone 2 (non-EU)',
  ZONE_3: 'EU zone 3',
  ZONE_3_NON_EU: 'zone 3 (non-EU)',
  ZONE_4: 'zone 4',
  ZONE_5: 'zone 5',
  ZONE_6: 'zone 6',
}

/** Where the boxes go, as the server worked the estimate out. */
export function destinationOf(order: Order): string {
  return (order.delivery?.country ?? order.billing?.country ?? 'DE').toUpperCase()
}

/**
 * How shipping was worked out from the price list: the zone of the
 * destination, then bulk (one shipment: base + per box), individual (one
 * parcel per box) or mixed (some of each). Mirrors `shippingCost`.
 */
export function shippingCalc(order: Order, money: Money): Calc {
  const country = destinationOf(order)
  const zone = zoneFor(country)
  if (!zone) {
    return { rows: [], note: `No price list rate for ${countryName(country)} — set by hand.` }
  }
  const rate = SHIPPING_RATES[zone]
  const where = zone === 'DE' ? countryName(country) : `${countryName(country)} · ${ZONE_LABEL[zone]}`
  const boxes = boxCount(order)
  const method = order.shippingMethod ?? 'bulk'
  const rows: CalcRow[] = []

  const bulkRows = (n: number, label: string) => {
    rows.push({ label: `${label} · base`, detail: where, amount: rate.bulkBase })
    rows.push({
      label: `${label} · per box`,
      detail: boxes === 0 ? `loose products, counted as 1 × ${money(rate.bulkPerBox)}` : `${plural(Math.max(1, n), 'box', 'boxes')} × ${money(rate.bulkPerBox)}`,
      amount: round2(rate.bulkPerBox * Math.max(1, n)),
    })
  }
  const individualRow = (n: number) =>
    rows.push({
      label: 'Individual parcels',
      detail: `${plural(n, 'box', 'boxes')} × ${money(rate.individualPerBox)}, each to its own address${method === 'individual' ? ` · ${where}` : ''}`,
      amount: round2(rate.individualPerBox * n),
    })

  if (method === 'individual') {
    individualRow(Math.max(1, boxes))
  } else if (method === 'mixed') {
    const together = Math.min(
      Math.max(1, order.shippingSplit?.bulkBoxes ?? 1),
      Math.max(1, boxes - 1),
    )
    bulkRows(together, 'Bulk')
    individualRow(boxes - together)
  } else {
    bulkRows(boxes, 'Bulk')
  }

  const listed = round2(rows.reduce((sum, r) => sum + r.amount, 0))
  const note =
    Math.abs(listed - order.shipping) >= 0.01
      ? `The price list gives ${money(listed)}; ${money(order.shipping)} is what the request holds (changed on confirmation, or the rates have changed since).`
      : undefined
  return { rows, note }
}

/**
 * The price one unit of a line was charged at. Requests priced on the server
 * store it; older box lines are summed from their contents.
 */
export function lineUnit(item: OrderItem): number {
  if (!item.box || item.pricingMode) return item.unitPrice
  return [
    ...item.box.lines,
    item.box.packaging,
    item.box.filling,
    item.box.greetingCard,
    item.box.stickers,
  ]
    .filter((p): p is BoxLine => Boolean(p))
    .reduce((sum, p) => sum + p.price * p.quantity, 0)
}

/**
 * The subtotal line by line, and the pick fees inside it worked out per box
 * line ("21 boxes × €1.35") — shown for the team, never charged twice.
 */
export function subtotalCalc(order: Order, money: Money): Calc & { pickFees: CalcRow | null } {
  const rows: CalcRow[] = order.items.map((item) => {
    const unit = lineUnit(item)
    return {
      label: item.name,
      detail: `${item.box ? plural(item.quantity, 'box', 'boxes') : `${item.quantity}`} × ${money(unit)}`,
      amount: round2(unit * item.quantity),
    }
  })
  const fees = order.items
    .filter((item) => item.box && item.pricingMode === 'parts')
    .map((item) => ({ boxes: item.quantity, fee: pickFee(picksOf(item.box!)) }))
    .filter((f) => f.fee > 0)
  const total = round2(fees.reduce((sum, f) => sum + f.boxes * f.fee, 0))
  return {
    rows,
    pickFees: fees.length
      ? {
          label: 'Pick fees included above (not added again)',
          detail: fees
            .map((f) => `${plural(f.boxes, 'box', 'boxes')} × ${money(f.fee)}`)
            .join(' + '),
          amount: total,
        }
      : null,
  }
}
