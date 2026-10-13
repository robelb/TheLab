import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  CircleAlert,
  FileDown,
  FileText,
  Loader2,
  Mail,
  Printer,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { copyText } from '@/lib/clipboard'
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
import { OrderEmails } from '@/components/dashboard/OrderEmails'
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
import type { BoxLine, StickerLogo } from '@/types/box'
import type { PlacementLayer, PlacementLayout } from '@/types/layout'
import {
  boxPriceCalc,
  countryName,
  daysUntilDelivery,
  orderSize,
  orderTodos,
  shippingCalc,
  subtotalCalc,
  lineUnit,
  SHIPPING_LABEL,
  type Calc,
} from '@/lib/orderOps'
import { isEu } from '@/lib/shipping'
import { cn } from '@/lib/utils'
import { formatDate, formatDateTime, formatPrice } from '@/utils/format'

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

/**
 * Which card or sticker the customer chose: a thumbnail and its name, both
 * opening that product in the dashboard so ops can check what to pack.
 */
function SupplyHeading({ label, line }: { label: string; line: BoxLine }) {
  return (
    <Link
      to={`/dashboard/products/${line.productId}`}
      className="group flex items-center gap-3"
      title={`Open ${line.name}`}
    >
      {line.image ? (
        <img
          src={line.image}
          alt=""
          className="size-12 shrink-0 rounded-brand border border-border/40 bg-muted/10 object-contain"
        />
      ) : (
        <span className="size-12 shrink-0 rounded-brand border border-dashed border-border/60" />
      )}
      <span className="min-w-0">
        <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="block truncate text-sm font-medium group-hover:text-primary group-hover:underline underline-offset-2">
          {line.name}
        </span>
      </span>
    </Link>
  )
}

/** A small copy button that confirms with a tick, for text ops paste elsewhere. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copy = async () => {
    setState((await copyText(text)) ? 'copied' : 'failed')
    window.setTimeout(() => setState('idle'), 1800)
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 rounded-brand border border-border/50 px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground print:hidden"
      aria-label={label}
    >
      {state === 'copied' ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}
    </button>
  )
}

const IMAGE_FILE = /\.(png|jpe?g|webp|gif|svg|avif)(\?|#|$)/i

/** The customer's sticker logo: a preview when it is an image, and its link. */
function UploadedLogo({ logo }: { logo: StickerLogo }) {
  const isImage = IMAGE_FILE.test(logo.url) || IMAGE_FILE.test(logo.name ?? '')
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Uploaded image
        </p>
        <CopyButton text={logo.url} label="Copy link to the logo" />
      </div>
      <div className="mt-1 flex items-center gap-3">
        <a href={logo.url} target="_blank" rel="noreferrer" className="shrink-0">
          {isImage ? (
            <img
              src={logo.url}
              alt={logo.name ?? 'Sticker logo'}
              className="size-24 rounded-brand border border-border/40 bg-white object-contain p-1"
            />
          ) : (
            <span className="flex size-24 items-center justify-center rounded-brand border border-border/40">
              <FileText className="size-8 text-muted-foreground" />
            </span>
          )}
        </a>
        <a
          href={logo.url}
          target="_blank"
          rel="noreferrer"
          download
          className="min-w-0 break-all text-sm text-primary underline underline-offset-2"
        >
          {logo.name ?? 'Download the logo file'}
        </a>
      </div>
    </div>
  )
}

/** Rows of a price working: what, how, how much. */
function CalcRows({ calc, money }: { calc: Calc; money: (n: number) => string }) {
  return (
    <ul className="mt-1 space-y-0.5 text-sm">
      {calc.rows.map((row) => (
        <li key={row.label} className="flex justify-between gap-3">
          <span className="min-w-0">
            {row.label}
            {row.detail && (
              <span className="text-xs text-muted-foreground"> · {row.detail}</span>
            )}
          </span>
          <span className="shrink-0 tabular-nums">
            {row.amount < 0 ? `− ${money(-row.amount)}` : money(row.amount)}
          </span>
        </li>
      ))}
    </ul>
  )
}

function LineCard({ item, currency }: { item: OrderItem; currency: string }) {
  const parts: BoxLine[] = item.box
    ? [
        ...item.box.lines,
        item.box.packaging,
        item.box.filling,
        item.box.greetingCard,
        item.box.stickers,
      ].filter((p): p is BoxLine => Boolean(p))
    : []

  /**
   * Priced the way the server prices it.
   *
   * A request priced on the server (`pricingMode` set) stores the unit price
   * it charged — ready-made price, volume tiers and pick fees included — so
   * that is the line. Older box lines carried a figure the shop assembled
   * client-side, which once arrived claiming zero; those are summed from their
   * contents instead.
   */
  const unit = lineUnit(item)
  const lineTotal = unit * item.quantity
  const money = (n: number) => formatPrice(n, item.currency ?? currency)
  const calc = boxPriceCalc(item, money)

  return (
    <li className="space-y-3 rounded-brand border border-border/40 p-4 break-inside-avoid">
      <div className="flex gap-4">
        {item.image && (
          <img
            src={item.image}
            alt=""
            className="size-24 shrink-0 rounded-brand border border-border/40 bg-muted/10 object-contain"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">{item.name}</p>
            <p className="text-xs text-muted-foreground">
              {item.sku ? `${item.sku} · ` : ''}
              {item.box ? `${item.quantity} ${item.quantity === 1 ? 'box' : 'boxes'}` : `× ${item.quantity}`}
              {item.box &&
                (item.pricingMode === 'bundle'
                  ? ' · ready-made box at its set price'
                  : ' · built by the customer')}
            </p>
            {item.tierPrice !== undefined && (
              <p className="text-xs text-primary">Volume price applied</p>
            )}
          </div>
          <div className="text-right">
            <p className="font-medium tabular-nums">{money(lineTotal)}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {money(unit)} {item.box ? 'per box' : 'each'}
            </p>
          </div>
        </div>
      </div>

      {/* A single branded product. */}
      {!item.box && <DesignBlock design={item.design} title="Design" />}

      {/* A built box: its contents, then every design inside it. */}
      {item.box && (
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              In each box · to pack for {item.quantity}
            </p>
            <table className="mt-1 w-full text-sm">
              <tbody>
                {parts.map((part) => (
                  <tr key={part.productId} className="border-b border-border/30 last:border-0">
                    <td className="py-1 pr-3">{part.name}</td>
                    <td className="py-1 pr-3 text-right tabular-nums text-muted-foreground">
                      {part.quantity} per box
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums">
                      {part.quantity * item.quantity} total
                    </td>
                    <td className="py-1 text-right tabular-nums text-muted-foreground">
                      {money(part.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {calc && (
            <div className="rounded-brand border border-border/40 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                How the price per box is made
              </p>
              <CalcRows calc={calc} money={money} />
              <div className="mt-1 flex justify-between border-t border-border/40 pt-1 text-sm font-medium">
                <span>Price per box</span>
                <span className="tabular-nums">{money(unit)}</span>
              </div>
              {item.quantity > 1 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>
                    × {item.quantity} boxes
                  </span>
                  <span className="tabular-nums">{money(lineTotal)}</span>
                </div>
              )}
              {calc.note && <p className="mt-1.5 text-xs text-muted-foreground">{calc.note}</p>}
            </div>
          )}

          {item.box.greetingCard && (
            <div className="rounded-brand border border-border/40 p-3">
              <SupplyHeading label="Greeting card" line={item.box.greetingCard} />
              {item.box.greetingCard.message?.trim() ? (
                <div className="mt-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Message
                    </p>
                    <CopyButton text={item.box.greetingCard.message} label="Copy message" />
                  </div>
                  <p className="mt-1 whitespace-pre-line rounded-brand border border-border/40 px-3 py-2 text-sm">
                    {item.box.greetingCard.message}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  No message yet — the customer will send it later.
                </p>
              )}
            </div>
          )}
          {item.box.stickers && (
            <div className="rounded-brand border border-border/40 p-3">
              <SupplyHeading label="Sticker logo" line={item.box.stickers} />
              {item.box.stickerLogo ? (
                <UploadedLogo logo={item.box.stickerLogo} />
              ) : (
                <p className="mt-2 text-sm">
                  <Badge variant="outline">Logo to follow</Badge>{' '}
                  <span className="text-muted-foreground">Ask the customer for it.</span>
                </p>
              )}
            </div>
          )}
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

/** A labelled block in the sidebar. */
function SideCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-brand border border-border/40 p-4 text-sm break-inside-avoid">
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** Label and value, skipped when there is no value. */
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="grid grid-cols-[96px_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
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

  const todos = orderTodos(order)
  const shipping = shippingCalc(order, (n) => formatPrice(n, order.currency))
  const subtotal = subtotalCalc(order, (n) => formatPrice(n, order.currency))
  const days = daysUntilDelivery(order)
  const method = order.shippingMethod ?? 'bulk'
  const billing = order.billing
  const delivery = order.delivery
  const billingCountry = billing?.country
  // What the invoice will charge: German VAT at home, none elsewhere.
  const vatNote = !billingCountry
    ? null
    : billingCountry === 'DE'
      ? 'German VAT, 19 %'
      : isEu(billingCountry)
        ? '0 % — intra-Community supply (VAT ID required)'
        : '0 % — export'

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/dashboard/orders">
            <ArrowLeft className="size-4" />
            All requests
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="size-4" />
          Print / PDF
        </Button>
      </div>

      {/* ── Who, when, where it stands ─────────────────────────────── */}
      <header className="space-y-3 border-b border-border/40 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-2xl font-semibold">{order.reference}</h1>
          <Badge variant="outline" className={STATUS_STYLE[order.status]}>
            {order.status}
          </Badge>
          {order.invoice && (
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
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {billing?.company || order.contact.company || order.contact.name} · sent{' '}
          {formatDateTime(order.createdAt)} ·{' '}
          {order.source === 'funnel'
            ? `collection ${order.collectionName ?? order.collectionSlug ?? ''}`
            : order.isGuest
              ? 'shop, as a guest'
              : 'shop, signed in'}
        </p>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
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
                      updated.status === 'quoted' ? 'Sent to the campaign feed.' : undefined,
                    ),
                  onError: (err) => notifyError(err, 'Could not change the status'),
                },
              )
            }
            // An invoiced order's status is settled until a credit note exists.
            disabled={setStatus.isPending || Boolean(order.invoice)}
          >
            <SelectTrigger className="h-8 w-36 text-xs" aria-label="Status">
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
              <Button size="sm" onClick={() => setConfirming(true)}>
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
          {admin && order.invoice && (
            <>
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
              <Button size="sm" variant="outline" onClick={() => void openInvoice(order)}>
                <FileDown className="size-4" />
                Invoice PDF
              </Button>
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
                    onSuccess: (sent) =>
                      sent.status === 'sent'
                        ? notifySaved(
                            order.invoice
                              ? 'Confirmation and invoice sent'
                              : 'Request confirmation sent',
                            `To ${order.contact.email}`,
                          )
                        : notifyError(
                            null,
                            'Email is only queued: no mail provider is configured on the server.',
                          ),
                    onError: (err) => notifyError(err, 'Could not send the email'),
                  },
                )
              }
            >
              {resend.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Mail className="size-4" />
              )}
              {resend.isPending ? 'Sending…' : 'Resend email'}
            </Button>
          )}
        </div>
      </header>

      {/* ── What is still open ─────────────────────────────────────── */}
      {todos.length > 0 && (
        <section className="rounded-brand border border-amber-500/40 bg-amber-500/5 p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">
            To do
          </h2>
          <ul className="space-y-1.5 text-sm">
            {todos.map((todo) => (
              <li key={todo.key} className="flex items-start gap-2">
                <CircleAlert
                  className={cn(
                    'mt-0.5 size-4 shrink-0',
                    todo.urgent ? 'text-destructive' : 'text-amber-600',
                  )}
                />
                <span>
                  <span className="font-medium">{todo.label}:</span> {todo.detail}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* ── What they asked for ──────────────────────────────────── */}
        <div className="space-y-5">
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              What they asked for · {orderSize(order)}
            </h2>
            <ul className="space-y-4">
              {order.items.map((item, i) => (
                <LineCard key={`${item.productId}-${i}`} item={item} currency={order.currency} />
              ))}
            </ul>
          </section>

          <section className="space-y-1 rounded-brand border border-border/40 p-4 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatPrice(order.subtotal, order.currency)}</span>
            </div>
            <div className="pl-3 text-xs text-muted-foreground [&_ul]:mt-0 [&_ul]:text-xs">
              <CalcRows calc={subtotal} money={(n) => formatPrice(n, order.currency)} />
            </div>
            {/* Inside the box prices; the customer never sees it as a line. */}
            {subtotal.pickFees && (
              <div className="flex justify-between gap-3 pl-3 text-xs text-muted-foreground">
                <span className="min-w-0">
                  {subtotal.pickFees.label} · {subtotal.pickFees.detail}
                </span>
                <span className="shrink-0 tabular-nums">
                  ({formatPrice(subtotal.pickFees.amount, order.currency)})
                </span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>Shipping · {SHIPPING_LABEL[method]}</span>
              <span className="tabular-nums">{formatPrice(order.shipping, order.currency)}</span>
            </div>
            {shipping.rows.length > 0 && (
              <div className="pl-3 text-xs text-muted-foreground [&_ul]:mt-0 [&_ul]:text-xs">
                <CalcRows calc={shipping} money={(n) => formatPrice(n, order.currency)} />
              </div>
            )}
            {shipping.note && (
              <p className="pl-3 text-xs text-amber-700 dark:text-amber-300">{shipping.note}</p>
            )}
            {order.totalGross != null ? (
              <>
                <div className="flex justify-between text-muted-foreground">
                  <span>Net</span>
                  <span className="tabular-nums">{formatPrice(order.total, order.currency)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>VAT {order.vatRate ?? ''} %</span>
                  <span className="tabular-nums">{formatPrice(order.vat ?? 0, order.currency)}</span>
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
                  <span className="tabular-nums">{formatPrice(order.total, order.currency)}</span>
                </div>
                <p className="pt-1 text-xs text-muted-foreground">
                  Estimate{vatNote ? `, VAT: ${vatNote}` : ''} — the price is agreed on
                  confirmation.
                </p>
              </>
            )}
          </section>

          {admin && <OrderEmails orderId={order.id} />}

          {/*
            Where this request came from. Folded away because the team pricing
            a box does not need it; open to whoever asks which campaign paid for
            which lead.
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
        </div>

        {/* ── Everything they told us ──────────────────────────────── */}
        <aside className="space-y-4">
          <SideCard title="Customer">
            <dl className="space-y-1">
              <Field
                label="Name"
                value={
                  [order.contact.firstName, order.contact.lastName].filter(Boolean).join(' ') ||
                  order.contact.name
                }
              />
              <Field label="Position" value={order.contact.position} />
              <Field label="Company" value={order.contact.company} />
              <Field
                label="Email"
                value={
                  <a href={`mailto:${order.contact.email}`} className="text-primary hover:underline">
                    {order.contact.email}
                  </a>
                }
              />
              <Field
                label="Phone"
                value={
                  order.contact.phone && (
                    <a href={`tel:${order.contact.phone}`} className="text-primary hover:underline">
                      {order.contact.phone}
                    </a>
                  )
                }
              />
              <Field label="Account" value={order.isGuest ? 'None — ordered as a guest' : 'Signed in'} />
              <Field label="Language" value={order.locale?.toUpperCase()} />
            </dl>
          </SideCard>

          {billing && (
            <SideCard title="Invoice to">
              <div>
                {addressLines([
                  billing.company,
                  billing.name,
                  billing.street,
                  billing.line2,
                  `${billing.zip} ${billing.city}`,
                  countryName(billing.country),
                ]).map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
              <dl className="space-y-1 pt-1">
                <Field label="VAT ID" value={billing.vatId || '—'} />
                <Field label="VAT" value={vatNote} />
                <Field label="PO number" value={billing.poNumber || 'Not given (may follow)'} />
                <Field label="Invoice email" value={billing.email} />
                <Field label="Payment" value={order.paymentMethod === 'invoice' ? 'By invoice' : '—'} />
              </dl>
            </SideCard>
          )}

          <SideCard title="Delivery">
            <dl className="space-y-1">
              <Field
                label="Method"
                value={
                  method === 'individual'
                    ? 'Individual — one box per recipient'
                    : method === 'mixed'
                      ? order.shippingSplit
                        ? `Mixed — ${order.shippingSplit.bulkBoxes} to the address below, ${order.shippingSplit.individualBoxes} individually`
                        : 'Mixed'
                      : 'Bulk — everything to one address'
                }
              />
              <Field
                label="Needed by"
                value={
                  delivery?.neededBy
                    ? `${formatDate(delivery.neededBy)}${
                        days !== null ? (days < 0 ? ` (${-days} days ago)` : ` (in ${days} days)`) : ''
                      }`
                    : 'Not stated'
                }
              />
              {method === 'individual' ? (
                <Field label="Recipients in" value={countryName(delivery?.country)} />
              ) : (
                <Field
                  label="Address"
                  value={
                    delivery?.sameAsBilling ? (
                      <span>Same as the invoice address</span>
                    ) : (
                      <span>
                        {addressLines([
                          delivery?.address,
                          delivery?.line2,
                          [delivery?.zip, delivery?.city].filter(Boolean).join(' '),
                          countryName(delivery?.country),
                        ]).map((line, i) => (
                          <span key={i} className="block">
                            {line}
                          </span>
                        ))}
                      </span>
                    )
                  }
                />
              )}
              {method !== 'bulk' && (
                <Field
                  label="Recipients"
                  value={
                    order.addressesLater
                      ? 'Addresses to follow by email'
                      : 'Addresses received'
                  }
                />
              )}
            </dl>
            {delivery?.notes && (
              <p className="whitespace-pre-wrap rounded-brand bg-muted/40 px-3 py-2">
                <span className="text-muted-foreground">Notes: </span>
                {delivery.notes}
              </p>
            )}
          </SideCard>

          {order.invoice && (
            <SideCard title="Invoice">
              <dl className="space-y-1">
                <Field label="Number" value={<span className="font-mono">{order.invoice.number}</span>} />
                <Field label="Issued" value={formatDateTime(order.invoice.issuedAt)} />
                <Field label="Due" value={formatDate(order.invoice.dueAt)} />
                <Field label="Amount" value={formatPrice(order.invoice.gross, order.invoice.currency)} />
                <Field label="Paid" value={order.paymentStatus === 'paid' ? 'Yes' : 'Not yet'} />
              </dl>
            </SideCard>
          )}

          <SideCard title="Consent">
            <dl className="space-y-1">
              <Field
                label="Privacy"
                value={
                  order.privacyAcceptedAt
                    ? `Accepted ${formatDateTime(order.privacyAcceptedAt)}`
                    : 'Not recorded'
                }
              />
            </dl>
          </SideCard>
        </aside>
      </div>
    </div>
  )
}
