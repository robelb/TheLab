import { useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useConfirmOrder } from '@/hooks/use-orders'
import { notifyError, notifySaved } from '@/lib/notify'
import type { Order, OrderBilling } from '@/api/orders'
import { lineUnit } from '@/lib/orderOps'
import { vatRateFor } from '@/lib/shipping'
import { todayIso } from '@/lib/schemas/common'
import { formatPrice } from '@/utils/format'

/** What the dialog suggests; the server's `PAYMENT_TERM_DAYS` default. */
const DEFAULT_PAYMENT_TERM_DAYS = 14

function isoInDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Whole days from today to a `YYYY-MM-DD` date. */
function daysUntil(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const now = new Date()
  return Math.round(
    (Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) /
      86_400_000,
  )
}

type BillingDraft = Record<
  'company' | 'name' | 'street' | 'line2' | 'zip' | 'city' | 'vatId' | 'poNumber' | 'email',
  string
>

/** A starting point from what the request does say about who sent it. */
function billingDraftFrom(order: Order): BillingDraft {
  return {
    company: order.contact.company ?? '',
    name: order.contact.name ?? '',
    street: '',
    line2: '',
    zip: '',
    city: '',
    vatId: '',
    poNumber: '',
    email: order.contact.email ?? '',
  }
}

/** Each field's label is `dashboard.orders.confirm.billing.<key>`. */
const BILLING_FIELDS: {
  key: keyof BillingDraft
  required?: boolean
  wide?: boolean
}[] = [
  { key: 'company', required: true, wide: true },
  { key: 'name' },
  { key: 'email' },
  { key: 'street', required: true, wide: true },
  { key: 'line2', wide: true },
  { key: 'zip', required: true },
  { key: 'city', required: true },
  { key: 'vatId' },
  { key: 'poNumber' },
]

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * An amount as typed, German or English style, rounded to cents (what the
 * server stores). With a comma, dots group thousands and the comma is the
 * decimal: "1.450,50" → 1450.5, "12,5" → 12.5. Without one, "1.450" (dots in
 * groups of three) is 1450, and "12.50" is 12.5.
 */
function parseAmount(raw: string): number | null {
  const compact = raw.trim().replace(/[\s€%]/g, '')
  if (!compact) return null
  const normalised = compact.includes(',')
    ? compact.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(compact)
      ? compact.replace(/\./g, '')
      : compact
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(normalised)) return null
  const value = Number(normalised)
  return Number.isFinite(value) && value >= 0 ? round(value) : null
}

/**
 * Confirming an order: the point a request becomes something owed.
 *
 * The request carries the estimate the shop showed. Here the price is agreed —
 * each line can be changed, and the shipping — and confirming stores it with
 * its VAT, issues the numbered invoice and emails it to the customer. None of
 * that can be undone from here, so the dialog says so before it happens.
 */
export function ConfirmOrderDialog({
  order,
  open,
  onOpenChange,
}: {
  order: Order
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const confirm = useConfirmOrder()
  // Confirmed before, but the invoice was never issued (that step failed).
  // The price is already stored and the server ignores new prices, so only
  // issuing the invoice is offered, at the stored price.
  const retry = Boolean(order.confirmedAt) && !order.invoice
  // Old box lines were stored at €0 and are priced from their contents, the
  // same figure the request page shows. Once confirmed, the stored price stands.
  const [prices, setPrices] = useState<string[]>(() =>
    order.items.map((item) => (retry ? item.unitPrice : lineUnit(item)).toFixed(2)),
  )
  const [shipping, setShipping] = useState(order.shipping.toFixed(2))
  // German VAT at home, none for other invoice countries — changeable here.
  const usualVatRate = vatRateFor(order.billing?.country ?? 'DE')
  const [vatRate, setVatRate] = useState(() =>
    String(retry && order.vatRate != null ? order.vatRate : usualVatRate),
  )
  const [dueDate, setDueDate] = useState(() => isoInDays(DEFAULT_PAYMENT_TERM_DAYS))
  // Only asked for when the request came without one (older shop orders).
  const needsBilling = !order.billing && !retry
  const [billing, setBilling] = useState<BillingDraft>(() => billingDraftFrom(order))

  const parsed = prices.map(parseAmount)
  const parsedShipping = parseAmount(shipping)
  const parsedVat = parseAmount(vatRate)
  const vatValid = parsedVat !== null && parsedVat <= 100
  const dueValid = /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && dueDate >= todayIso()
  const emailValid = !billing.email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billing.email.trim())
  const billingValid =
    !needsBilling ||
    (BILLING_FIELDS.every((field) => !field.required || billing[field.key].trim()) && emailValid)
  const valid =
    parsed.every((p) => p !== null) &&
    parsedShipping !== null &&
    vatValid &&
    dueValid &&
    billingValid
  const termDays = dueValid ? daysUntil(dueDate) : null
  // The rate the invoice will carry; the server recomputes the amounts from it.
  const previewVatRate = vatValid ? Math.round(parsedVat! * 100) / 100 : usualVatRate
  const vatChanged = vatValid && previewVatRate !== usualVatRate

  const totals = useMemo(() => {
    if (!valid) return null
    const subtotal = round(
      order.items.reduce((sum, item, i) => sum + (parsed[i] ?? 0) * item.quantity, 0),
    )
    const net = round(subtotal + (parsedShipping ?? 0))
    const vat = round((net * previewVatRate) / 100)
    return { subtotal, net, vat, gross: round(net + vat) }
  }, [valid, parsed, parsedShipping, order.items, previewVatRate])

  const invoiceEmail =
    (needsBilling ? billing.email.trim() : order.billing?.email) || order.contact.email
  const m = (n: number) => formatPrice(n, order.currency)

  function submit() {
    if (!valid) return
    confirm.mutate(
      {
        id: order.id,
        body: {
          lines: order.items.map((_, index) => ({
            index,
            unitPrice: parsed[index] ?? 0,
          })),
          shipping: parsedShipping ?? 0,
          // Only when changed: otherwise the server applies the usual rate.
          ...(vatChanged ? { vatRate: previewVatRate } : {}),
          dueDate,
          ...(needsBilling
            ? {
                billing: {
                  company: billing.company.trim(),
                  name: billing.name.trim() || null,
                  street: billing.street.trim(),
                  line2: billing.line2.trim() || null,
                  zip: billing.zip.trim(),
                  city: billing.city.trim(),
                  country: 'DE',
                  vatId: billing.vatId.trim() || null,
                  poNumber: billing.poNumber.trim() || null,
                  email: billing.email.trim() || null,
                } satisfies OrderBilling,
              }
            : {}),
        },
      },
      {
        onSuccess: (updated) => {
          const delivery = updated.emailDelivery
          if (delivery?.status === 'failed') {
            notifyError(
              null,
              t(
                delivery.willRetry
                  ? 'dashboard.orders.confirm.toast.emailFailedRetry'
                  : 'dashboard.orders.confirm.toast.emailFailedResend',
                { reference: updated.reference, email: invoiceEmail, error: delivery.error },
              ),
            )
          } else {
            notifySaved(
              t('dashboard.orders.confirm.toast.confirmed', { reference: updated.reference }),
              !updated.invoice
                ? undefined
                : delivery?.status === 'sent'
                  ? t('dashboard.orders.confirm.toast.invoiceSent', {
                      number: updated.invoice.number,
                      email: invoiceEmail,
                    })
                  : delivery?.status === 'queued'
                    ? t('dashboard.orders.confirm.toast.invoiceQueued', {
                        number: updated.invoice.number,
                      })
                    : t('dashboard.orders.confirm.toast.invoiceAlreadyIssued', {
                        number: updated.invoice.number,
                      }),
            )
          }
          onOpenChange(false)
        },
        onError: (err) => notifyError(err, t('dashboard.orders.confirm.toast.failed')),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('dashboard.orders.confirm.title', { reference: order.reference })}
          </DialogTitle>
          <DialogDescription>{t('dashboard.orders.confirm.description')}</DialogDescription>
        </DialogHeader>

        {retry && (
          <p className="rounded-brand border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
            {t('dashboard.orders.confirm.retryNote')}
          </p>
        )}

        <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
          {order.items.map((item, i) => (
            <div
              key={`${item.productId}-${i}`}
              className="grid grid-cols-[1fr_110px_90px] items-center gap-3 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t('dashboard.orders.confirm.estimated', {
                    count: item.quantity,
                    price: m(retry ? item.unitPrice : lineUnit(item)),
                  })}
                </p>
              </div>
              <Input
                aria-label={t('dashboard.orders.confirm.unitPriceFor', { name: item.name })}
                inputMode="decimal"
                disabled={retry}
                value={prices[i]}
                onChange={(e) =>
                  setPrices((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))
                }
                className={parsed[i] === null ? 'border-destructive' : undefined}
              />
              <span className="text-right tabular-nums">
                {parsed[i] !== null ? m(round((parsed[i] ?? 0) * item.quantity)) : '—'}
              </span>
            </div>
          ))}
          <div className="grid grid-cols-[1fr_110px_90px] items-center gap-3 border-t border-border pt-3 text-sm">
            <Label htmlFor="confirm-shipping">{t('dashboard.orders.confirm.shipping')}</Label>
            <Input
              id="confirm-shipping"
              inputMode="decimal"
              disabled={retry}
              value={shipping}
              onChange={(e) => setShipping(e.target.value)}
              className={parsedShipping === null ? 'border-destructive' : undefined}
            />
            <span className="text-right tabular-nums">
              {parsedShipping !== null ? m(parsedShipping) : '—'}
            </span>
          </div>
          <div className="grid grid-cols-[1fr_110px_90px] items-center gap-3 text-sm">
            <div>
              <Label htmlFor="confirm-vat">{t('dashboard.orders.confirm.vatRate')}</Label>
              <p
                className={`text-xs ${vatValid ? (vatChanged ? 'text-amber-700' : 'text-muted-foreground') : 'text-destructive'}`}
              >
                {!vatValid
                  ? t('dashboard.orders.confirm.vatRateInvalid')
                  : t('dashboard.orders.confirm.vatRateUsual', {
                      rate: usualVatRate,
                      country: order.billing?.country ?? 'DE',
                    })}
              </p>
            </div>
            <Input
              id="confirm-vat"
              inputMode="decimal"
              disabled={retry}
              value={vatRate}
              onChange={(e) => setVatRate(e.target.value)}
              className={vatValid ? undefined : 'border-destructive'}
              aria-invalid={vatValid ? undefined : true}
            />
            <span className="text-right tabular-nums">{vatValid ? `${previewVatRate} %` : '—'}</span>
          </div>
        </div>

        {totals && (
          <dl className="space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <dt>{t('dashboard.orders.confirm.net')}</dt>
              <dd className="tabular-nums">{m(totals.net)}</dd>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <dt>
                {t('dashboard.orders.confirm.vat', { rate: previewVatRate })}
                {previewVatRate === 0 &&
                  order.billing &&
                  ` ${t('dashboard.orders.confirm.vatExempt', {
                    country: order.billing.country,
                    vatId: order.billing.vatId ?? '—',
                  })}`}
              </dt>
              <dd className="tabular-nums">{m(totals.vat)}</dd>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <dt>{t('dashboard.orders.confirm.invoiceTotal')}</dt>
              <dd className="tabular-nums">{m(totals.gross)}</dd>
            </div>
          </dl>
        )}

        {needsBilling && (
          <fieldset className="space-y-3 border-t border-border pt-3">
            <legend className="text-sm font-medium">
              {t('dashboard.orders.confirm.billingTitle')}
            </legend>
            <p className="text-xs text-muted-foreground">
              {t('dashboard.orders.confirm.billingHint')}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {BILLING_FIELDS.map((field) => {
                const value = billing[field.key]
                const badEmail = field.key === 'email' && !emailValid
                return (
                  <div
                    key={field.key}
                    className={`space-y-1 ${field.wide ? 'sm:col-span-2' : ''}`}
                  >
                    <Label htmlFor={`confirm-billing-${field.key}`} className="text-xs">
                      {t(`dashboard.orders.confirm.billing.${field.key}`)}
                      {!field.required && (
                        <span className="font-normal text-muted-foreground">
                          {' '}
                          {t('dashboard.orders.confirm.optional')}
                        </span>
                      )}
                    </Label>
                    <Input
                      id={`confirm-billing-${field.key}`}
                      type={field.key === 'email' ? 'email' : 'text'}
                      value={value}
                      onChange={(e) =>
                        setBilling((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      aria-required={field.required ? true : undefined}
                      aria-invalid={badEmail ? true : undefined}
                    />
                  </div>
                )
              })}
            </div>
          </fieldset>
        )}

        <div className="grid grid-cols-[1fr_160px] items-center gap-3 border-t border-border pt-3 text-sm">
          <div>
            <Label htmlFor="confirm-due">{t('dashboard.orders.confirm.dueBy')}</Label>
            <p
              id="confirm-due-hint"
              className={`text-xs ${dueValid ? 'text-muted-foreground' : 'text-destructive'}`}
            >
              {!dueValid
                ? t('dashboard.orders.confirm.dueInvalid')
                : termDays === 0
                  ? t('dashboard.orders.confirm.dueOnReceipt')
                  : t('dashboard.orders.confirm.dueInDays', { count: termDays ?? 0 })}
            </p>
          </div>
          <DatePicker
            id="confirm-due"
            min={todayIso()}
            value={dueDate}
            onChange={setDueDate}
            aria-describedby="confirm-due-hint"
            aria-invalid={dueValid ? undefined : true}
          />
        </div>

        <p className="rounded-brand border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
          <Trans
            i18nKey="dashboard.orders.confirm.warning"
            values={{ email: invoiceEmail }}
            components={{ email: <span className="font-medium" /> }}
          />
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('dashboard.orders.confirm.cancel')}
          </Button>
          <Button onClick={submit} disabled={!valid || confirm.isPending}>
            {confirm.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            {retry ? t('dashboard.orders.confirm.issueInvoice') : t('dashboard.orders.confirm.submit')}
          </Button>
        </DialogFooter>
        {needsBilling && !billingValid && (
          <p className="-mt-2 text-right text-xs text-muted-foreground">
            {t('dashboard.orders.confirm.billingRequired')}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
