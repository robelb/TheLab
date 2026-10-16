import type { Order, OrderItem } from '@/api/orders'
import type { BoxDetails, BoxLine } from '@/types/box'
import { PICK_FEE_FIRST, PICK_FEE_MARKUP, PICK_FEE_NEXT, pickFee } from '@/lib/pricing'
import { SHIPPING_RATES, zoneFor, type ShippingZone } from '@/lib/shipping'
import { formatDate } from '@/utils/format'
import i18n, { currentLocale } from '@/i18n'

/** Looks up a key under `dashboard.orders` at call time, so a language switch applies. */
const tr = (key: string, options?: Record<string, unknown>): string =>
  i18n.t(`dashboard.orders.${key}`, options)

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

/** Names of the custom-design supplies in a request, each once. */
export function customDesignItems(order: Order): string[] {
  const names = boxesOf(order).flatMap((box) =>
    [box.packaging, box.greetingCard, box.stickers]
      // An "Eigenes Design" option, or a box or sticker designed in the editor.
      .filter((line) => line && (isCustomDesign(line.name) || line.customPrint))
      .map((line) => line!.name),
  )
  return [...new Set(names)]
}

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
    boxes ? tr('size.boxes', { count: boxes }) : '',
    loose ? tr('size.items', { count: loose }) : '',
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
      label: days < 0 ? tr('todo.dueSoon.labelPassed') : tr('todo.dueSoon.label', { days }),
      detail:
        days < 0
          ? tr('todo.dueSoon.detailPassed', { count: -days })
          : tr('todo.dueSoon.detail', { count: days }),
      urgent: true,
    })
  }
  // A quoted request still has to be confirmed before its invoice goes out.
  if (open) {
    todos.push({
      key: 'confirm',
      label: tr('todo.confirm.label'),
      detail: tr('todo.confirm.detail'),
    })
    // What the customer still owes us — addresses, logo, card text, artwork —
    // only matters until the order is confirmed: confirming it means the team
    // has it, whichever way it arrived.
    if (order.addressesLater) {
      todos.push({
        key: 'addresses',
        label: tr('todo.addresses.label'),
        detail: tr('todo.addresses.detail'),
      })
    }
    const missingLogo = boxes.filter((box) => box.stickers && !box.stickerLogo?.url).length
    if (missingLogo) {
      todos.push({
        key: 'stickerLogo',
        label: tr('todo.stickerLogo.label'),
        detail: tr('todo.stickerLogo.detail', { count: missingLogo }),
      })
    }
    const missingMessage = boxes.filter(
      (box) => box.greetingCard && !box.greetingCard.message?.trim(),
    ).length
    if (missingMessage) {
      todos.push({
        key: 'cardMessage',
        label: tr('todo.cardMessage.label'),
        detail: tr('todo.cardMessage.detail', { count: missingMessage }),
      })
    }
    const custom = customDesignItems(order)
    if (custom.length && !order.designAgreedAt) {
      todos.push({
        key: 'customDesign',
        label: tr('todo.customDesign.label'),
        detail: tr('todo.customDesign.detail', { items: custom.join(', ') }),
      })
    }
  }
  if (order.invoice && order.paymentStatus !== 'paid') {
    todos.push({
      key: 'payment',
      label: tr('todo.payment.label'),
      detail: tr('todo.payment.detail', {
        number: order.invoice.number,
        date: formatDate(order.invoice.dueAt),
      }),
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

/** A country's name for an ISO code, in the dashboard's language. */
export function countryName(code: string | null | undefined): string {
  if (!code) return '—'
  try {
    return new Intl.DisplayNames([currentLocale()], { type: 'region' }).of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

/** Bulk, individual or mixed, as the shipping method reads in the current language. */
export function shippingLabel(method: string): string {
  return tr(`shippingMethod.${method}`)
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

/** Items picked into one box: every product unit, the card, the stickers. */
export function picksOf(box: BoxDetails): number {
  const units = (line: { quantity: number } | null | undefined) => line?.quantity ?? 0
  return (
    box.lines.reduce((sum, line) => sum + line.quantity, 0) +
    units(box.greetingCard) +
    units(box.stickers)
  )
}

/**
 * "(€0.30 + 5 × €0.15) × 1.9" for 6 picks — the fulfilment cost and our
 * markup on it. For the team only; shoppers only ever see the result.
 */
export function pickFeeWorking(picks: number, money: Money): string {
  const markup = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(
    PICK_FEE_MARKUP,
  )
  if (picks <= 1) {
    return tr('calc.pickFeeSingle', { count: picks, price: money(PICK_FEE_FIRST), markup })
  }
  return tr('calc.pickFeeMany', {
    count: picks,
    first: money(PICK_FEE_FIRST),
    rest: picks - 1,
    next: money(PICK_FEE_NEXT),
    markup,
  })
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
  const count = item.quantity

  if (item.pricingMode === 'bundle') {
    const rows: CalcRow[] = []
    if (item.tierPrice !== undefined && box.bundlePrice != null) {
      rows.push({ label: tr('calc.setPrice'), amount: box.bundlePrice })
      rows.push({
        label: tr('calc.volumePriceFor', { count }),
        amount: round2(item.unitPrice - box.bundlePrice),
      })
    } else {
      rows.push({
        label: item.tierPrice !== undefined ? tr('calc.volumePriceFor', { count }) : tr('calc.setPrice'),
        amount: item.unitPrice,
      })
    }
    return {
      rows,
      note: tr('calc.bundleNote'),
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
      rows: [{ label: tr('calc.contentsAtList'), amount: list }],
      note: tr('calc.legacyNote'),
    }
  }

  const picks = picksOf(box)
  const fee = pickFee(picks)
  const rows: CalcRow[] = [
    { label: tr('calc.contentsAtList'), detail: tr('calc.parts', { count: parts.length }), amount: list },
    { label: tr('calc.pickFee'), detail: pickFeeWorking(picks, money), amount: fee },
  ]
  const adjustment = round2(item.unitPrice - list - fee)
  if (Math.abs(adjustment) >= 0.01) {
    rows.push({
      label: adjustment < 0 ? tr('calc.volumePrices') : tr('calc.adjustment'),
      detail:
        adjustment < 0
          ? tr('calc.volumePricesDetail', { count })
          : tr('calc.adjustmentDetail'),
      amount: adjustment,
    })
  }
  return { rows }
}

const zoneLabel = (zone: ShippingZone): string => tr(`zone.${zone}`)

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
    return { rows: [], note: tr('calc.noRate', { country: countryName(country) }) }
  }
  const rate = SHIPPING_RATES[zone]
  const where = zone === 'DE' ? countryName(country) : `${countryName(country)} · ${zoneLabel(zone)}`
  const boxes = boxCount(order)
  const method = order.shippingMethod ?? 'bulk'
  const rows: CalcRow[] = []

  const bulkRows = (n: number) => {
    rows.push({ label: tr('calc.bulkBase'), detail: where, amount: rate.bulkBase })
    rows.push({
      label: tr('calc.bulkPerBox'),
      detail: boxes === 0
        ? tr('calc.looseProducts', { price: money(rate.bulkPerBox) })
        : tr('calc.boxesTimes', { count: Math.max(1, n), price: money(rate.bulkPerBox) }),
      amount: round2(rate.bulkPerBox * Math.max(1, n)),
    })
  }
  const individualRow = (n: number) =>
    rows.push({
      label: tr('calc.individualParcels'),
      detail: `${tr('calc.individualDetail', { count: n, price: money(rate.individualPerBox) })}${method === 'individual' ? ` · ${where}` : ''}`,
      amount: round2(rate.individualPerBox * n),
    })

  if (method === 'individual') {
    individualRow(Math.max(1, boxes))
  } else if (method === 'mixed') {
    const together = Math.min(
      Math.max(1, order.shippingSplit?.bulkBoxes ?? 1),
      Math.max(1, boxes - 1),
    )
    bulkRows(together)
    individualRow(boxes - together)
  } else {
    bulkRows(boxes)
  }

  const listed = round2(rows.reduce((sum, r) => sum + r.amount, 0))
  const note =
    Math.abs(listed - order.shipping) >= 0.01
      ? tr('calc.shippingDiffers', { listed: money(listed), held: money(order.shipping) })
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
      detail: item.box
        ? tr('calc.boxesTimes', { count: item.quantity, price: money(unit) })
        : `${item.quantity} × ${money(unit)}`,
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
          label: tr('calc.pickFeesIncluded'),
          detail: fees
            .map((f) => tr('calc.boxesTimes', { count: f.boxes, price: money(f.fee) }))
            .join(' + '),
          amount: total,
        }
      : null,
  }
}
