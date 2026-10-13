import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
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
  Pencil,
  Printer,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import { OrderDetailsDialog } from '@/components/dashboard/OrderDetailsDialog'
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
  shippingLabel,
  type Calc,
} from '@/lib/orderOps'
import i18n from '@/i18n'
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

function layerLabel(layer: PlacementLayer, t: TFunction): string {
  if (layer.kind === 'logo') return t('dashboard.orders.detail.placement.logo')
  if (layer.kind === 'image') return t('dashboard.orders.detail.placement.image')
  return t('dashboard.orders.detail.placement.text')
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
  const { t } = useTranslation()
  if (!layout.layers.length) return null
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-xs">
        <thead>
          <tr className="border-b border-border/60 text-left text-muted-foreground">
            <th className="py-1 pr-3 font-medium">{t('dashboard.orders.detail.placement.element')}</th>
            <th className="py-1 pr-3 font-medium">{t('dashboard.orders.detail.placement.content')}</th>
            <th className="py-1 pr-3 font-medium">{t('dashboard.orders.detail.placement.across')}</th>
            <th className="py-1 pr-3 font-medium">{t('dashboard.orders.detail.placement.down')}</th>
            <th className="py-1 pr-3 font-medium">{t('dashboard.orders.detail.placement.width')}</th>
            <th className="py-1 pr-3 font-medium">{t('dashboard.orders.detail.placement.rotation')}</th>
            <th className="py-1 font-medium">{t('dashboard.orders.detail.placement.typeface')}</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {layout.layers.map((layer) => (
            <tr key={layer.id} className="border-b border-border/30 last:border-0">
              <td className="py-1.5 pr-3 whitespace-nowrap">{layerLabel(layer, t)}</td>
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
                  ? layer.fontWeight === 'bold'
                    ? t('dashboard.orders.detail.placement.bold', {
                        face: layer.fontStyle ?? 'sans',
                      })
                    : (layer.fontStyle ?? 'sans')
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {t('dashboard.orders.detail.placement.note')}
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
  const { t } = useTranslation()
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
              {t('dashboard.orders.detail.design.approved')}
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
              {t('dashboard.orders.detail.design.photoreal')}
            </figcaption>
          </figure>
        )}
      </div>
      {design.prompt && (
        <p className="rounded-brand bg-muted/40 px-2 py-1.5 text-xs">
          <span className="text-muted-foreground">{t('dashboard.orders.detail.design.brief')} </span>
          {design.prompt}
        </p>
      )}
      {design.logoUrl && (
        <p className="text-xs text-muted-foreground">
          {t('dashboard.orders.detail.design.customLogo')}
        </p>
      )}
      {design.layout ? (
        <PlacementTable layout={design.layout} />
      ) : (
        <p className="text-xs text-muted-foreground">
          {t('dashboard.orders.detail.design.noPlacement')}
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
  const { t } = useTranslation()
  const { can } = useAuth()
  const body = (
    <>
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
    </>
  )
  // The product editor is for our team only; it sends anyone else back to the
  // dashboard, so company admins get the heading without a link.
  if (!can('manage_all')) return <div className="flex items-center gap-3">{body}</div>
  return (
    <Link
      to={`/dashboard/products/${line.productId}`}
      className="group flex items-center gap-3"
      title={t('dashboard.orders.detail.openProduct', { name: line.name })}
    >
      {body}
    </Link>
  )
}

/** A small copy button that confirms with a tick, for text ops paste elsewhere. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useTranslation()
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
      {state === 'copied'
        ? t('dashboard.orders.detail.copy.copied')
        : state === 'failed'
          ? t('dashboard.orders.detail.copy.failed')
          : t('dashboard.orders.detail.copy.copy')}
    </button>
  )
}

const IMAGE_FILE = /\.(png|jpe?g|webp|gif|svg|avif)(\?|#|$)/i

/** The customer's sticker logo: a preview when it is an image, and its link. */
function UploadedLogo({ logo }: { logo: StickerLogo }) {
  const { t } = useTranslation()
  const isImage = IMAGE_FILE.test(logo.url) || IMAGE_FILE.test(logo.name ?? '')
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('dashboard.orders.detail.logo.uploaded')}
        </p>
        <CopyButton text={logo.url} label={t('dashboard.orders.detail.logo.copyLink')} />
      </div>
      <div className="mt-1 flex items-center gap-3">
        <a href={logo.url} target="_blank" rel="noreferrer" className="shrink-0">
          {isImage ? (
            <img
              src={logo.url}
              alt={logo.name ?? t('dashboard.orders.detail.logo.alt')}
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
          {logo.name ?? t('dashboard.orders.detail.logo.download')}
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
  const { t } = useTranslation()
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
              {item.box
                ? t('dashboard.orders.detail.line.boxes', { count: item.quantity })
                : `× ${item.quantity}`}
              {item.box &&
                ` · ${
                  item.pricingMode === 'bundle'
                    ? t('dashboard.orders.detail.line.readyMade')
                    : t('dashboard.orders.detail.line.built')
                }`}
            </p>
            {item.tierPrice !== undefined && (
              <p className="text-xs text-primary">
                {t('dashboard.orders.detail.line.volumeApplied')}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="font-medium tabular-nums">{money(lineTotal)}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {item.box
                ? t('dashboard.orders.detail.line.perBox', { price: money(unit) })
                : t('dashboard.orders.detail.line.each', { price: money(unit) })}
            </p>
          </div>
        </div>
      </div>

      {/* A single branded product. */}
      {!item.box && (
        <DesignBlock design={item.design} title={t('dashboard.orders.detail.design.title')} />
      )}

      {/* A built box: its contents, then every design inside it. */}
      {item.box && (
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('dashboard.orders.detail.line.inEachBox', { count: item.quantity })}
            </p>
            <table className="mt-1 w-full text-sm">
              <tbody>
                {parts.map((part) => (
                  <tr key={part.productId} className="border-b border-border/30 last:border-0">
                    <td className="py-1 pr-3">{part.name}</td>
                    <td className="py-1 pr-3 text-right tabular-nums text-muted-foreground">
                      {t('dashboard.orders.detail.line.partPerBox', { count: part.quantity })}
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums">
                      {t('dashboard.orders.detail.line.partTotal', {
                        count: part.quantity * item.quantity,
                      })}
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
                {t('dashboard.orders.detail.line.howPriced')}
              </p>
              <CalcRows calc={calc} money={money} />
              <div className="mt-1 flex justify-between border-t border-border/40 pt-1 text-sm font-medium">
                <span>{t('dashboard.orders.detail.line.pricePerBox')}</span>
                <span className="tabular-nums">{money(unit)}</span>
              </div>
              {item.quantity > 1 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{t('dashboard.orders.detail.line.timesBoxes', { count: item.quantity })}</span>
                  <span className="tabular-nums">{money(lineTotal)}</span>
                </div>
              )}
              {calc.note && <p className="mt-1.5 text-xs text-muted-foreground">{calc.note}</p>}
            </div>
          )}

          {item.box.greetingCard && (
            <div className="rounded-brand border border-border/40 p-3">
              <SupplyHeading
                label={t('dashboard.orders.detail.card.title')}
                line={item.box.greetingCard}
              />
              {item.box.greetingCard.message?.trim() ? (
                <div className="mt-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('dashboard.orders.detail.card.message')}
                    </p>
                    <CopyButton
                      text={item.box.greetingCard.message}
                      label={t('dashboard.orders.detail.card.copyMessage')}
                    />
                  </div>
                  <p className="mt-1 whitespace-pre-line rounded-brand border border-border/40 px-3 py-2 text-sm">
                    {item.box.greetingCard.message}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('dashboard.orders.detail.card.noMessage')}
                </p>
              )}
            </div>
          )}
          {item.box.stickers && (
            <div className="rounded-brand border border-border/40 p-3">
              <SupplyHeading
                label={t('dashboard.orders.detail.logo.title')}
                line={item.box.stickers}
              />
              {item.box.stickerLogo ? (
                <UploadedLogo logo={item.box.stickerLogo} />
              ) : (
                <p className="mt-2 text-sm">
                  <Badge variant="outline">{t('dashboard.orders.detail.logo.toFollow')}</Badge>{' '}
                  <span className="text-muted-foreground">
                    {t('dashboard.orders.detail.logo.askCustomer')}
                  </span>
                </p>
              )}
            </div>
          )}
          {item.box.packagingPrompt && (
            <p className="rounded-brand bg-muted/40 px-2 py-1.5 text-xs">
              <span className="text-muted-foreground">
                {t('dashboard.orders.detail.line.boxBrief')}{' '}
              </span>
              {item.box.packagingPrompt}
            </p>
          )}
          {item.box.packagingLayout && (
            <div className="space-y-1.5 rounded-brand border border-border/40 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('dashboard.orders.detail.line.boxPlacement')}
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
                  title={t('dashboard.orders.detail.design.titleFor', {
                    name: part?.name ?? productId,
                  })}
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
function attributionRows(order: Order, t: TFunction): [string, string][] {
  const a = order.attribution
  const rows: [string, string | null | undefined][] = [
    [t('dashboard.orders.detail.campaign.source'), order.source ?? null],
    [t('dashboard.orders.detail.campaign.collection'), order.collectionSlug],
    [t('dashboard.orders.detail.campaign.enteredThrough'), a?.entrySlug],
    [t('dashboard.orders.detail.campaign.gclid'), a?.gclid],
    [t('dashboard.orders.detail.campaign.fbclid'), a?.fbclid],
    [t('dashboard.orders.detail.campaign.msclkid'), a?.msclkid],
    ['utm_source', a?.utmSource],
    ['utm_medium', a?.utmMedium],
    ['utm_campaign', a?.utmCampaign],
    ['utm_term', a?.utmTerm],
    ['utm_content', a?.utmContent],
    [t('dashboard.orders.detail.campaign.landedOn'), a?.landingPath],
    [t('dashboard.orders.detail.campaign.referrer'), a?.referrer],
    [
      t('dashboard.orders.detail.campaign.firstSeen'),
      a?.firstSeenAt ? formatDateTime(a.firstSeenAt) : null,
    ],
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
    notifyError(err, i18n.t('dashboard.orders.detail.toast.invoiceOpenFailed'))
  }
}

/**
 * The status changes the server accepts (orders.service.ts): a company can
 * only withdraw its request; our team can also mark it quoted, undo that, and
 * reopen a withdrawn one. Confirming has its own button.
 */
const STATUS_MOVES: Record<'admin' | 'company', Partial<Record<OrderStatus, OrderStatus[]>>> = {
  company: { new: ['cancelled'], quoted: ['cancelled'] },
  admin: { new: ['quoted', 'cancelled'], quoted: ['new', 'cancelled'], cancelled: ['new'] },
}

function statusMoves(from: OrderStatus, admin: boolean): OrderStatus[] {
  return STATUS_MOVES[admin ? 'admin' : 'company'][from] ?? []
}

export function OrderDetailPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const { data: order, isLoading, error } = useOrder(id)
  const setStatus = useSetOrderStatus()
  const setPayment = useSetPaymentStatus()
  const resend = useResendOrderEmail()
  const { can } = useAuth()
  const admin = can('manage_all')
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  // Withdrawing and the payment toggle are asked about first.
  const [askCancel, setAskCancel] = useState(false)
  const [askPayment, setAskPayment] = useState(false)

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
          {t('dashboard.orders.detail.notFound')}
        </p>
        <Button asChild variant="outline">
          <Link to="/dashboard/orders">
            <ArrowLeft className="size-4" />
            {t('dashboard.orders.detail.backToRequests')}
          </Link>
        </Button>
      </div>
    )
  }

  const todos = orderTodos(order)

  const changeStatus = (status: OrderStatus) =>
    setStatus.mutate(
      { id: order.id, status },
      {
        onSuccess: (updated) =>
          notifySaved(
            t('dashboard.orders.detail.toast.marked', {
              reference: order.reference,
              status: t(`dashboard.orders.status.${updated.status}`),
            }),
            // Worth saying: this is the signal the ads side scores on.
            updated.status === 'quoted'
              ? t('dashboard.orders.detail.toast.sentToFeed')
              : undefined,
          ),
        onError: (err) => notifyError(err, t('dashboard.orders.detail.toast.statusFailed')),
      },
    )

  const nextPayment = order.paymentStatus === 'paid' ? 'unpaid' : 'paid'
  const togglePayment = () =>
    setPayment.mutate(
      { id: order.id, paymentStatus: nextPayment },
      {
        onSuccess: (updated) =>
          notifySaved(
            t('dashboard.orders.detail.toast.marked', {
              reference: order.reference,
              status: t(`dashboard.orders.payment.${updated.paymentStatus ?? 'unpaid'}`),
            }),
          ),
        onError: (err) => notifyError(err, t('dashboard.orders.detail.toast.paymentFailed')),
      },
    )
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
      ? t('dashboard.orders.detail.vatNote.de')
      : isEu(billingCountry)
        ? t('dashboard.orders.detail.vatNote.eu')
        : t('dashboard.orders.detail.vatNote.export')

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/dashboard/orders">
            <ArrowLeft className="size-4" />
            {t('dashboard.orders.detail.allRequests')}
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="size-4" />
          {t('dashboard.orders.detail.print')}
        </Button>
      </div>

      {/* ── Who, when, where it stands ─────────────────────────────── */}
      <header className="space-y-3 border-b border-border/40 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-2xl font-semibold">{order.reference}</h1>
          <Badge variant="outline" className={STATUS_STYLE[order.status]}>
            {t(`dashboard.orders.status.${order.status}`)}
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
              {t(`dashboard.orders.payment.${order.paymentStatus ?? 'unpaid'}`)}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {t('dashboard.orders.detail.sentLine', {
            customer: billing?.company || order.contact.company || order.contact.name,
            date: formatDateTime(order.createdAt),
            origin:
              order.source === 'funnel'
                ? t('dashboard.orders.detail.origin.collection', {
                    name: order.collectionName ?? order.collectionSlug ?? '',
                  })
                : order.isGuest
                  ? t('dashboard.orders.detail.origin.guest')
                  : t('dashboard.orders.detail.origin.signedIn'),
          })}
        </p>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Select
            value={order.status}
            onValueChange={(status) =>
              // Withdrawing is asked about first; the customer is not told.
              status === 'cancelled' ? setAskCancel(true) : changeStatus(status as OrderStatus)
            }
            // An invoiced order's status is settled until a credit note exists.
            disabled={setStatus.isPending || Boolean(order.invoice)}
          >
            <SelectTrigger className="h-8 w-36 text-xs" aria-label={t('dashboard.orders.detail.statusLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORDER_STATUSES.map((s) => (
                // Confirming fixes the price and issues the invoice, so it has
                // its own button rather than being a dropdown choice.
                <SelectItem
                  key={s}
                  value={s}
                  // Only the moves the server allows from here — see STATUS_MOVES.
                  disabled={s !== order.status && !statusMoves(order.status, admin).includes(s)}
                >
                  {t(`dashboard.orders.status.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AlertDialog open={askCancel} onOpenChange={setAskCancel}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('dashboard.orders.detail.cancelDialog.title', { reference: order.reference })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t('dashboard.orders.detail.cancelDialog.description')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('dashboard.orders.detail.cancelDialog.keep')}</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => changeStatus('cancelled')}>
                  {t('dashboard.orders.detail.cancelDialog.confirm')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {/* Production details keep arriving after the invoice, so this stays
              open; the dialog itself locks the invoice address once confirmed. */}
          {admin && order.status !== 'cancelled' && (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="size-4" />
                {t('dashboard.orders.details.button')}
              </Button>
              <OrderDetailsDialog
                key={`details-${order.updatedAt}`}
                order={order}
                open={editing}
                onOpenChange={setEditing}
              />
            </>
          )}
          {admin && !order.invoice && order.status !== 'cancelled' && (
            <>
              <Button size="sm" onClick={() => setConfirming(true)}>
                <CheckCircle2 className="size-4" />
                {t('dashboard.orders.detail.confirmOrder')}
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
                onClick={() => setAskPayment(true)}
              >
                {setPayment.isPending && <Loader2 className="size-4 animate-spin" />}
                {order.paymentStatus === 'paid'
                  ? t('dashboard.orders.detail.markUnpaid')
                  : t('dashboard.orders.detail.markPaid')}
              </Button>
              <AlertDialog open={askPayment} onOpenChange={setAskPayment}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {nextPayment === 'paid'
                        ? t('dashboard.orders.detail.paymentDialog.titlePaid', {
                            number: order.invoice.number,
                          })
                        : t('dashboard.orders.detail.paymentDialog.titleUnpaid', {
                            number: order.invoice.number,
                          })}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {nextPayment === 'paid'
                        ? t('dashboard.orders.detail.paymentDialog.descriptionPaid', {
                            amount: formatPrice(order.invoice.gross, order.invoice.currency),
                          })
                        : t('dashboard.orders.detail.paymentDialog.descriptionUnpaid')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('dashboard.orders.details.cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={togglePayment}>
                      {nextPayment === 'paid'
                        ? t('dashboard.orders.detail.markPaid')
                        : t('dashboard.orders.detail.markUnpaid')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button size="sm" variant="outline" onClick={() => void openInvoice(order)}>
                <FileDown className="size-4" />
                {t('dashboard.orders.detail.invoicePdf')}
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
                              ? t('dashboard.orders.detail.toast.confirmationSent')
                              : t('dashboard.orders.detail.toast.receivedSent'),
                            t('dashboard.orders.detail.toast.to', { email: order.contact.email }),
                          )
                        : notifyError(null, t('dashboard.orders.detail.toast.emailQueued')),
                    onError: (err) =>
                      notifyError(err, t('dashboard.orders.detail.toast.emailFailed')),
                  },
                )
              }
            >
              {resend.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Mail className="size-4" />
              )}
              {resend.isPending
                ? t('dashboard.orders.detail.sending')
                : t('dashboard.orders.detail.resendEmail')}
            </Button>
          )}
        </div>
      </header>

      {/* ── What is still open (the team's checklist) ─────────────── */}
      {admin && todos.length > 0 && (
        <section className="rounded-brand border border-amber-500/40 bg-amber-500/5 p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">
            {t('dashboard.orders.detail.todo')}
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
              {t('dashboard.orders.detail.askedFor', { size: orderSize(order) })}
            </h2>
            <ul className="space-y-4">
              {order.items.map((item, i) => (
                <LineCard key={`${item.productId}-${i}`} item={item} currency={order.currency} />
              ))}
            </ul>
          </section>

          <section className="space-y-1 rounded-brand border border-border/40 p-4 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>{t('dashboard.orders.detail.totals.subtotal')}</span>
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
              <span>
                {t('dashboard.orders.detail.totals.shipping', { method: shippingLabel(method) })}
              </span>
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
                  <span>{t('dashboard.orders.detail.totals.net')}</span>
                  <span className="tabular-nums">{formatPrice(order.total, order.currency)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>{t('dashboard.orders.detail.totals.vat', { rate: order.vatRate ?? '' })}</span>
                  <span className="tabular-nums">{formatPrice(order.vat ?? 0, order.currency)}</span>
                </div>
                <div className="flex justify-between text-base font-semibold">
                  <span>{t('dashboard.orders.detail.totals.total')}</span>
                  <span className="tabular-nums">
                    {formatPrice(order.totalGross, order.currency)}
                  </span>
                </div>
                <p className="pt-1 text-xs text-muted-foreground">
                  {t('dashboard.orders.detail.totals.agreed', {
                    date: order.confirmedAt ? formatDateTime(order.confirmedAt) : '',
                  })}
                </p>
              </>
            ) : (
              <>
                <div className="flex justify-between text-base font-semibold">
                  <span>{t('dashboard.orders.detail.totals.totalNet')}</span>
                  <span className="tabular-nums">{formatPrice(order.total, order.currency)}</span>
                </div>
                <p className="pt-1 text-xs text-muted-foreground">
                  {vatNote
                    ? t('dashboard.orders.detail.totals.estimateVat', { vat: vatNote })
                    : t('dashboard.orders.detail.totals.estimate')}
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
                {t('dashboard.orders.detail.campaign.title')}
                {order.collectionSlug ? ` · ${order.collectionSlug}` : ''}
              </summary>
              <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                {attributionRows(order, t).map(([label, value]) => (
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
          <SideCard title={t('dashboard.orders.detail.customer.title')}>
            <dl className="space-y-1">
              <Field
                label={t('dashboard.orders.detail.customer.name')}
                value={
                  [order.contact.firstName, order.contact.lastName].filter(Boolean).join(' ') ||
                  order.contact.name
                }
              />
              <Field label={t('dashboard.orders.detail.customer.position')} value={order.contact.position} />
              <Field label={t('dashboard.orders.detail.customer.company')} value={order.contact.company} />
              <Field
                label={t('dashboard.orders.detail.customer.email')}
                value={
                  <a href={`mailto:${order.contact.email}`} className="text-primary hover:underline">
                    {order.contact.email}
                  </a>
                }
              />
              <Field
                label={t('dashboard.orders.detail.customer.phone')}
                value={
                  order.contact.phone && (
                    <a href={`tel:${order.contact.phone}`} className="text-primary hover:underline">
                      {order.contact.phone}
                    </a>
                  )
                }
              />
              <Field
                label={t('dashboard.orders.detail.customer.account')}
                value={
                  order.isGuest
                    ? t('dashboard.orders.detail.customer.guest')
                    : t('dashboard.orders.detail.customer.signedIn')
                }
              />
              <Field
                label={t('dashboard.orders.detail.customer.language')}
                value={order.locale?.toUpperCase()}
              />
            </dl>
          </SideCard>

          {billing && (
            <SideCard title={t('dashboard.orders.detail.billing.title')}>
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
                <Field label={t('dashboard.orders.detail.billing.vatId')} value={billing.vatId || '—'} />
                <Field label={t('dashboard.orders.detail.billing.vat')} value={vatNote} />
                <Field
                  label={t('dashboard.orders.detail.billing.poNumber')}
                  value={billing.poNumber || t('dashboard.orders.detail.billing.poMissing')}
                />
                <Field label={t('dashboard.orders.detail.billing.email')} value={billing.email} />
                <Field
                  label={t('dashboard.orders.detail.billing.payment')}
                  value={
                    order.paymentMethod === 'invoice'
                      ? t('dashboard.orders.detail.billing.byInvoice')
                      : '—'
                  }
                />
              </dl>
            </SideCard>
          )}

          <SideCard title={t('dashboard.orders.detail.delivery.title')}>
            <dl className="space-y-1">
              <Field
                label={t('dashboard.orders.detail.delivery.method')}
                value={
                  method === 'individual'
                    ? t('dashboard.orders.detail.delivery.individual')
                    : method === 'mixed'
                      ? order.shippingSplit
                        ? t('dashboard.orders.detail.delivery.mixedSplit', {
                            bulk: order.shippingSplit.bulkBoxes,
                            individual: order.shippingSplit.individualBoxes,
                          })
                        : shippingLabel('mixed')
                      : t('dashboard.orders.detail.delivery.bulk')
                }
              />
              <Field
                label={t('dashboard.orders.detail.delivery.neededBy')}
                value={
                  delivery?.neededBy
                    ? days === null
                      ? formatDate(delivery.neededBy)
                      : days < 0
                        ? t('dashboard.orders.detail.delivery.neededByAgo', {
                            date: formatDate(delivery.neededBy),
                            count: -days,
                          })
                        : t('dashboard.orders.detail.delivery.neededByIn', {
                            date: formatDate(delivery.neededBy),
                            count: days,
                          })
                    : t('dashboard.orders.detail.delivery.notStated')
                }
              />
              {method === 'individual' ? (
                <Field
                  label={t('dashboard.orders.detail.delivery.recipientsIn')}
                  value={countryName(delivery?.country)}
                />
              ) : (
                <Field
                  label={t('dashboard.orders.detail.delivery.address')}
                  value={
                    delivery?.sameAsBilling ? (
                      <span>{t('dashboard.orders.detail.delivery.sameAsBilling')}</span>
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
                  label={t('dashboard.orders.detail.delivery.recipients')}
                  value={
                    order.addressesLater
                      ? t('dashboard.orders.detail.delivery.addressesLater')
                      : t('dashboard.orders.detail.delivery.addressesReceived')
                  }
                />
              )}
            </dl>
            {delivery?.notes && (
              <p className="whitespace-pre-wrap rounded-brand bg-muted/40 px-3 py-2">
                <span className="text-muted-foreground">
                  {t('dashboard.orders.detail.delivery.notes')}{' '}
                </span>
                {delivery.notes}
              </p>
            )}
          </SideCard>

          {order.invoice && (
            <SideCard title={t('dashboard.orders.detail.invoice.title')}>
              <dl className="space-y-1">
                <Field
                  label={t('dashboard.orders.detail.invoice.number')}
                  value={<span className="font-mono">{order.invoice.number}</span>}
                />
                <Field
                  label={t('dashboard.orders.detail.invoice.issued')}
                  value={formatDateTime(order.invoice.issuedAt)}
                />
                <Field
                  label={t('dashboard.orders.detail.invoice.due')}
                  value={formatDate(order.invoice.dueAt)}
                />
                <Field
                  label={t('dashboard.orders.detail.invoice.amount')}
                  value={formatPrice(order.invoice.gross, order.invoice.currency)}
                />
                <Field
                  label={t('dashboard.orders.detail.invoice.paid')}
                  value={
                    order.paymentStatus === 'paid'
                      ? t('dashboard.orders.detail.invoice.yes')
                      : t('dashboard.orders.detail.invoice.notYet')
                  }
                />
              </dl>
            </SideCard>
          )}

          <SideCard title={t('dashboard.orders.detail.consent.title')}>
            <dl className="space-y-1">
              <Field
                label={t('dashboard.orders.detail.consent.privacy')}
                value={
                  order.privacyAcceptedAt
                    ? t('dashboard.orders.detail.consent.accepted', {
                        date: formatDateTime(order.privacyAcceptedAt),
                      })
                    : t('dashboard.orders.detail.consent.notRecorded')
                }
              />
            </dl>
          </SideCard>
        </aside>
      </div>
    </div>
  )
}
