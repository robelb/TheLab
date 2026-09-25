import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  FileDown,
  Loader2,
  Mail,
  Printer,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useOrder,
  useResendOrderEmail,
  useSetOrderStatus,
  useSetPaymentStatus,
} from '@/hooks/use-orders'
import { useAuth } from '@/context/AuthContext'
import { ConfirmOrderDialog } from '@/components/dashboard/ConfirmOrderDialog'
import { notifyError, notifySaved } from '@/lib/notify'
import {
  fetchInvoicePdf,
  ORDER_STATUSES,
  type Order,
  type OrderItem,
  type OrderStatus,
} from '@/api/orders'
// import { downloadText, orderToCsv, orderToJson } from '@/lib/orderExport'
import type { ProductDesign } from '@/lib/boxDraft'
import type { BoxLine } from '@/types/box'
import type { PlacementLayer, PlacementLayout } from '@/types/layout'
import { formatDateTime, formatPrice } from '@/utils/format'

const STATUS_STYLE: Record<OrderStatus, string> = {
  new: 'border-primary/40 bg-primary/10 text-primary',
  quoted: 'border-border/60 text-muted-foreground',
  confirmed: 'border-border/60 text-muted-foreground',
  cancelled: 'border-border/40 text-muted-foreground line-through',
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}

function layerLabel(layer: PlacementLayer): string {
  if (layer.kind === 'logo') return 'Brand logo'
  if (layer.kind === 'image') return 'Artwork'
  return 'Wording'
}

/**
 * The placement, spelled out.
 *
 * This is the part a printer cannot get from looking at the picture: which
 * element, how big, how far across, how far down, tilted how much, in which
 * face and colour. Positions are fractions of the product photo rather than
 * millimetres — we hold no print-area dimensions — so it is stated as a
 * percentage and labelled as such rather than implying a measurement.
 */
function PlacementTable({ layout }: { layout: PlacementLayout }) {
  if (!layout.layers.length) return null
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-xs">
        <thead>
          <tr className="border-b border-border/60 text-left text-muted-foreground">
            <th className="py-1 pr-3 font-medium">Element</th>
            <th className="py-1 pr-3 font-medium">Content</th>
            <th className="py-1 pr-3 font-medium">Across</th>
            <th className="py-1 pr-3 font-medium">Down</th>
            <th className="py-1 pr-3 font-medium">Width</th>
            <th className="py-1 pr-3 font-medium">Rotation</th>
            <th className="py-1 font-medium">Typeface</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {layout.layers.map((layer) => (
            <tr key={layer.id} className="border-b border-border/30 last:border-0">
              <td className="py-1.5 pr-3 whitespace-nowrap">{layerLabel(layer)}</td>
              <td className="max-w-[12rem] truncate py-1.5 pr-3">
                {layer.kind === 'text' ? (
                  <span className="flex items-center gap-1.5">
                    {layer.color && (
                      <span
                        aria-hidden
                        className="size-3 shrink-0 rounded-sm border border-border/60"
                        style={{ background: layer.color }}
                      />
                    )}
                    <span className="truncate">{layer.text}</span>
                    {layer.color && (
                      <span className="text-muted-foreground">{layer.color}</span>
                    )}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="py-1.5 pr-3">{pct(layer.x)}</td>
              <td className="py-1.5 pr-3">{pct(layer.y)}</td>
              <td className="py-1.5 pr-3">{pct(layer.width)}</td>
              <td className="py-1.5 pr-3">
                {layer.rotation ? `${Math.round(layer.rotation)}°` : '—'}
              </td>
              <td className="py-1.5 text-muted-foreground">
                {layer.kind === 'text'
                  ? `${layer.fontStyle ?? 'sans'}${
                      layer.fontWeight === 'bold' ? ' bold' : ''
                    }`
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Positions are the centre of each element as a share of the product photo,
        not a physical measurement.
      </p>
    </div>
  )
}

/** Everything known about one design: the artwork, the brief, the placement. */
function DesignBlock({
  design,
  title,
}: {
  design: ProductDesign | null | undefined
  title: string
}) {
  if (!design) return null
  const artwork = design.flat ?? design.image
  return (
    <div className="space-y-2 rounded-brand border border-border/40 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="flex flex-wrap gap-3">
        {artwork && (
          <figure className="space-y-1">
            <img
              src={artwork}
              alt=""
              className="max-h-56 rounded-brand border border-border/40 object-contain"
            />
            <figcaption className="text-[11px] text-muted-foreground">
              Approved artwork — this is what prints
            </figcaption>
          </figure>
        )}
        {design.photoreal && (
          <figure className="space-y-1">
            <img
              src={design.photoreal}
              alt=""
              className="max-h-56 rounded-brand border border-border/40 object-contain"
            />
            <figcaption className="text-[11px] text-muted-foreground">
              Photoreal render — presentation only
            </figcaption>
          </figure>
        )}
      </div>
      {design.prompt && (
        <p className="rounded-brand bg-muted/40 px-2 py-1.5 text-xs">
          <span className="text-muted-foreground">Brief: </span>
          {design.prompt}
        </p>
      )}
      {design.logoUrl && (
        <p className="text-xs text-muted-foreground">
          Used a custom logo for this design, not the company mark.
        </p>
      )}
      {design.layout ? (
        <PlacementTable layout={design.layout} />
      ) : (
        <p className="text-xs text-muted-foreground">
          No placement recorded — the artwork was generated from the brief rather
          than positioned by hand.
        </p>
      )}
    </div>
  )
}

function LineCard({ item, currency }: { item: OrderItem; currency: string }) {
  const parts: BoxLine[] = item.box
    ? [...item.box.lines, item.box.packaging, item.box.filling].filter(
        (p): p is BoxLine => Boolean(p),
      )
    : []

  /**
   * Priced the way the server prices it.
   *
   * A box's own `unitPrice` is a figure the shop assembles client-side, and the
   * server deliberately ignores it in favour of the contents. Showing it here
   * would let a line disagree with the total on the same page — which is what
   * happened before this: a box arrived claiming zero and read as free while
   * the total counted every mug in it.
   */
  const lineTotal = item.box
    ? parts.reduce((sum, p) => sum + p.price * p.quantity, 0) * item.quantity
    : item.unitPrice * item.quantity

  return (
    <li className="space-y-3 rounded-brand border border-border/40 p-4 break-inside-avoid">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{item.name}</p>
          <p className="text-xs text-muted-foreground">
            {item.sku ? `${item.sku} · ` : ''}× {item.quantity}
          </p>
        </div>
        <span className="tabular-nums">
          {formatPrice(lineTotal, item.currency ?? currency)}
        </span>
      </div>

      {/* A single branded product. */}
      {!item.box && (
        <DesignBlock design={item.design} title="Design" />
      )}
      {!item.box && !item.design && item.image && (
        <div className="flex flex-wrap items-center gap-3">
          <img
            src={item.image}
            alt=""
            className="max-h-40 rounded-brand border border-border/40 object-contain"
          />
          <p className="text-xs text-muted-foreground">
            Image only — no design was recorded for this line.
          </p>
        </div>
      )}

      {/* A built box: its contents, then every design inside it. */}
      {item.box && (
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              What is in the box
            </p>
            <ul className="mt-1 space-y-1 text-sm">
              {parts.map((part) => (
                <li
                  key={part.productId}
                  className="flex items-center justify-between gap-3 border-b border-border/30 py-1 last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {part.name}
                    <span className="text-muted-foreground">
                      {' '}
                      × {part.quantity * item.quantity}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatPrice(part.price, part.currency ?? currency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {item.box.packagingPrompt && (
            <p className="rounded-brand bg-muted/40 px-2 py-1.5 text-xs">
              <span className="text-muted-foreground">Box print brief: </span>
              {item.box.packagingPrompt}
            </p>
          )}
          {item.box.packagingLayout && (
            <div className="space-y-1.5 rounded-brand border border-border/40 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Box placement
              </p>
              <PlacementTable layout={item.box.packagingLayout} />
            </div>
          )}

          {item.box.designs &&
            Object.entries(item.box.designs).map(([productId, design]) => {
              const part = parts.find((p) => p.productId === productId)
              return (
                <DesignBlock
                  key={productId}
                  design={design}
                  title={`Design — ${part?.name ?? productId}`}
                />
              )
            })}
        </div>
      )}
    </li>
  )
}

/**
 * One request, in full.
 *
 * This replaced a modal. The modal could show what was ordered but not what was
 * designed — there is no room in a dialog for artwork at a size you can judge,
 * let alone a placement table per element — and it could not be printed or
 * handed to a supplier.
 */
/** The campaign fields that are actually set, in a readable order. */
function attributionRows(order: Order): [string, string][] {
  const a = order.attribution
  const rows: [string, string | null | undefined][] = [
    ['Source', order.source ?? null],
    ['Collection', order.collectionSlug],
    ['Entered through', a?.entrySlug],
    ['Google click id', a?.gclid],
    ['Meta click id', a?.fbclid],
    ['Microsoft click id', a?.msclkid],
    ['utm_source', a?.utmSource],
    ['utm_medium', a?.utmMedium],
    ['utm_campaign', a?.utmCampaign],
    ['utm_term', a?.utmTerm],
    ['utm_content', a?.utmContent],
    ['Landed on', a?.landingPath],
    ['Referrer', a?.referrer],
    ['First seen', a?.firstSeenAt ? formatDateTime(a.firstSeenAt) : null],
  ]
  return rows.filter((row): row is [string, string] => Boolean(row[1]))
}

/** A billing or delivery address as lines. */
function addressLines(lines: (string | null | undefined)[]): string[] {
  return lines.filter((l): l is string => Boolean(l && l.trim()))
}

const COUNTRY_NAMES: Record<string, string> = { DE: 'Germany' }

/** Opens the invoice in a new tab; fetched with the session, not a bare link. */
async function openInvoice(order: Order) {
  // Opened before the request so the popup blocker sees the click.
  const tab = window.open('', '_blank')
  try {
    const blob = await fetchInvoicePdf(order.id)
    const url = URL.createObjectURL(blob)
    if (tab) tab.location.href = url
    else window.location.href = url
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (err) {
    tab?.close()
    notifyError(err, 'Could not open the invoice')
  }
}

export function OrderDetailPage() {
  const { id = '' } = useParams()
  const { data: order, isLoading, error } = useOrder(id)
  const setStatus = useSetOrderStatus()
  const setPayment = useSetPaymentStatus()
  const resend = useResendOrderEmail()
  const { can } = useAuth()
  const admin = can('manage_all')
  const [confirming, setConfirming] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <p className="text-sm text-muted-foreground">
          That request could not be found.
        </p>
        <Button asChild variant="outline">
          <Link to="/dashboard/orders">
            <ArrowLeft className="size-4" />
            Back to requests
          </Link>
        </Button>
      </div>
    )
  }

  const sent = new Date(order.createdAt)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/dashboard/orders">
            <ArrowLeft className="size-4" />
            All requests
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" />
            Print / PDF
          </Button>
          {/* <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadText(
                `${order.reference}.csv`,
                orderToCsv(order),
                'text/csv;charset=utf-8',
              )
            }
            title="One row per thing to order, boxes exploded into their contents"
          >
            <Download className="size-4" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadText(
                `${order.reference}.json`,
                orderToJson(order),
                'application/json',
              )
            }
            title="The whole record, every placement included"
          >
            <FileJson className="size-4" />
            JSON
          </Button> */}
        </div>
      </div>

      <header className="space-y-3 border-b border-border/40 pb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-mono text-2xl font-semibold">{order.reference}</h1>
          <Badge variant="outline" className={STATUS_STYLE[order.status]}>
            {order.status}
          </Badge>
        </div>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">From</dt>
            <dd>
              {order.contact.name} · {order.contact.email}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Sent</dt>
            <dd>{sent.toLocaleString()}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Origin</dt>
            <dd>
              {order.source === 'funnel'
                ? `Collection · ${order.collectionName ?? order.collectionSlug ?? '—'}`
                : 'Shop'}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Deliver to</dt>
            <dd>
              {order.delivery?.sameAsBilling
                ? 'Billing address'
                : [
                    order.delivery?.address,
                    order.delivery?.line2,
                    order.delivery?.zip,
                    order.delivery?.city,
                    order.delivery?.country,
                  ]
                    .filter(Boolean)
                    .join(', ') || 'Not given'}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Delivery date</dt>
            <dd>{order.delivery?.neededBy || 'Not stated'}</dd>
          </div>
          {order.contact.company && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Company</dt>
              <dd>
                {order.contact.company}
                {order.isGuest && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (no account)
                  </span>
                )}
              </dd>
            </div>
          )}
          {order.contact.phone && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Phone</dt>
              <dd>{order.contact.phone}</dd>
            </div>
          )}
          {order.contact.position && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Position</dt>
              <dd>{order.contact.position}</dd>
            </div>
          )}
          {order.locale && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Reply in</dt>
              <dd className="uppercase">{order.locale}</dd>
            </div>
          )}
        </dl>
        {order.billing && (
          <div className="grid gap-4 rounded-brand border border-border/40 px-3 py-3 text-sm sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Invoice to
              </p>
              {addressLines([
                order.billing.company,
                order.billing.name,
                order.billing.street,
                order.billing.line2,
                `${order.billing.zip} ${order.billing.city}`,
                COUNTRY_NAMES[order.billing.country] ?? order.billing.country,
              ]).map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
            <dl className="space-y-1">
              <div className="flex gap-2">
                <dt className="text-muted-foreground">VAT ID</dt>
                <dd>{order.billing.vatId || '—'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">PO number</dt>
                <dd>{order.billing.poNumber || '—'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Payment</dt>
                <dd>{order.paymentMethod === 'invoice' ? 'By invoice' : '—'}</dd>
              </div>
              {order.privacyAcceptedAt && (
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Privacy accepted</dt>
                  <dd>{formatDateTime(order.privacyAcceptedAt)}</dd>
                </div>
              )}
            </dl>
          </div>
        )}
        {order.delivery?.notes && (
          <p className="whitespace-pre-wrap rounded-brand bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Notes: </span>
            {order.delivery.notes}
          </p>
        )}

        {/*
          Where this request came from.

          Folded away because the team pricing a box does not need it, and open
          to whoever is asking which campaign paid for which lead. It is also
          what was forwarded to the ads side, so it is worth being able to see.
        */}
        {(order.source === 'funnel' || order.attribution) && (
          <details className="group rounded-brand border border-border/40 bg-muted/10 px-3 py-2 text-sm print:hidden">
            <summary className="cursor-pointer list-none text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground">
              Campaign
              {order.collectionSlug ? ` · ${order.collectionSlug}` : ''}
            </summary>
            <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
              {attributionRows(order).map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 break-all">{value}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <span className="text-xs text-muted-foreground">Status</span>
        <Select
          value={order.status}
          onValueChange={(status) =>
            setStatus.mutate(
              { id: order.id, status: status as OrderStatus },
              {
                onSuccess: (updated) =>
                  notifySaved(
                    `${order.reference} marked ${updated.status}`,
                    // Worth saying: this is the signal the ads side scores on.
                    updated.status === 'quoted'
                      ? 'Sent to the campaign feed.'
                      : undefined,
                  ),
                onError: (err) =>
                  notifyError(err, 'Could not change the status'),
              },
            )
          }
          // An invoiced order's status is settled until a credit note exists.
          disabled={setStatus.isPending || Boolean(order.invoice)}
        >
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORDER_STATUSES.map((s) => (
              // Confirming fixes the price and issues the invoice, so it has
              // its own button rather than being a dropdown choice.
              <SelectItem
                key={s}
                value={s}
                disabled={s === 'confirmed' && order.status !== 'confirmed'}
              >
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {admin && !order.invoice && order.status !== 'cancelled' && (
          <>
            <Button
              size="sm"
              onClick={() => setConfirming(true)}
              disabled={!order.billing}
              title={
                order.billing
                  ? undefined
                  : 'This request has no billing address — ask the customer for one first.'
              }
            >
              <CheckCircle2 className="size-4" />
              Confirm order…
            </Button>
            <ConfirmOrderDialog
              key={order.updatedAt}
              order={order}
              open={confirming}
              onOpenChange={setConfirming}
            />
          </>
        )}
        {admin && (
          <Button
            size="sm"
            variant="ghost"
            disabled={resend.isPending}
            onClick={() =>
              resend.mutate(
                { id: order.id, template: order.invoice ? 'confirmed' : 'received' },
                {
                  onSuccess: () =>
                    notifySaved(
                      order.invoice
                        ? 'Confirmation and invoice queued again'
                        : 'Request confirmation queued again',
                      `To ${order.contact.email}`,
                    ),
                  onError: (err) => notifyError(err, 'Could not queue the email'),
                },
              )
            }
          >
            <Mail className="size-4" />
            Resend email
          </Button>
        )}
      </div>

      {order.invoice && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-brand border border-border/40 bg-muted/10 px-4 py-3 text-sm print:hidden">
          <div className="space-y-0.5">
            <p className="font-medium">
              Invoice <span className="font-mono">{order.invoice.number}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Issued {formatDateTime(order.invoice.issuedAt)} · due{' '}
              {new Date(order.invoice.dueAt).toLocaleDateString()} ·{' '}
              {formatPrice(order.invoice.gross, order.invoice.currency)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={
                order.paymentStatus === 'paid'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-700'
              }
            >
              {order.paymentStatus ?? 'unpaid'}
            </Badge>
            {admin && (
              <Button
                size="sm"
                variant="outline"
                disabled={setPayment.isPending}
                onClick={() =>
                  setPayment.mutate(
                    {
                      id: order.id,
                      paymentStatus: order.paymentStatus === 'paid' ? 'unpaid' : 'paid',
                    },
                    {
                      onSuccess: (updated) =>
                        notifySaved(`${order.reference} marked ${updated.paymentStatus}`),
                      onError: (err) => notifyError(err, 'Could not change the payment'),
                    },
                  )
                }
              >
                {setPayment.isPending && <Loader2 className="size-4 animate-spin" />}
                {order.paymentStatus === 'paid' ? 'Mark unpaid' : 'Mark as paid'}
              </Button>
            )}
            {admin && (
              <Button size="sm" variant="outline" onClick={() => void openInvoice(order)}>
                <FileDown className="size-4" />
                Invoice PDF
              </Button>
            )}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          What they asked for
        </h2>
        <ul className="space-y-4">
          {order.items.map((item, i) => (
            <LineCard
              key={`${item.productId}-${i}`}
              item={item}
              currency={order.currency}
            />
          ))}
        </ul>
      </section>

      <section className="space-y-1 border-t border-border/40 pt-4 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span className="tabular-nums">
            {formatPrice(order.subtotal, order.currency)}
          </span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Shipping</span>
          <span className="tabular-nums">
            {formatPrice(order.shipping, order.currency)}
          </span>
        </div>
        {order.totalGross != null ? (
          <>
            <div className="flex justify-between text-muted-foreground">
              <span>Net</span>
              <span className="tabular-nums">
                {formatPrice(order.total, order.currency)}
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>VAT {order.vatRate ?? ''} %</span>
              <span className="tabular-nums">
                {formatPrice(order.vat ?? 0, order.currency)}
              </span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">
                {formatPrice(order.totalGross, order.currency)}
              </span>
            </div>
            <p className="pt-1 text-xs text-muted-foreground">
              Agreed price, confirmed{' '}
              {order.confirmedAt ? formatDateTime(order.confirmedAt) : ''}.
            </p>
          </>
        ) : (
          <>
            <div className="flex justify-between text-base font-semibold">
              <span>Total (net)</span>
              <span className="tabular-nums">
                {formatPrice(order.total, order.currency)}
              </span>
            </div>
            <p className="pt-1 text-xs text-muted-foreground">
              Estimate, plus VAT — the price is agreed on confirmation.
            </p>
          </>
        )}
      </section>
    </div>
  )
}
