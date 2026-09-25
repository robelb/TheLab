import { useMemo, useState } from 'react'
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
import { VAT_RATE } from '@/lib/box'
import { todayIso } from '@/lib/schemas/common'
import { formatPrice } from '@/utils/format'

/**
 * Shown so the total can be read before it is sent. The server applies its own
 * configured rate and its figures are the ones stored; this only previews them.
 */
const PREVIEW_VAT_RATE = VAT_RATE

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

const BILLING_FIELDS: {
  key: keyof BillingDraft
  label: string
  required?: boolean
  wide?: boolean
}[] = [
  { key: 'company', label: 'Company', required: true, wide: true },
  { key: 'name', label: 'Attention of' },
  { key: 'email', label: 'Invoice email' },
  { key: 'street', label: 'Street and number', required: true, wide: true },
  { key: 'line2', label: 'Address line 2', wide: true },
  { key: 'zip', label: 'Postcode', required: true },
  { key: 'city', label: 'City', required: true },
  { key: 'vatId', label: 'VAT ID' },
  { key: 'poNumber', label: 'PO number' },
]

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function parseAmount(raw: string): number | null {
  const normalised = raw.trim().replace(/\s/g, '').replace(',', '.')
  if (!normalised) return null
  const value = Number(normalised)
  return Number.isFinite(value) && value >= 0 ? value : null
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
  const confirm = useConfirmOrder()
  const [prices, setPrices] = useState<string[]>(() =>
    order.items.map((item) => item.unitPrice.toFixed(2)),
  )
  const [shipping, setShipping] = useState(order.shipping.toFixed(2))
  const [dueDate, setDueDate] = useState(() => isoInDays(DEFAULT_PAYMENT_TERM_DAYS))
  // Only asked for when the request came without one (older shop orders).
  const needsBilling = !order.billing
  const [billing, setBilling] = useState<BillingDraft>(() => billingDraftFrom(order))

  const parsed = prices.map(parseAmount)
  const parsedShipping = parseAmount(shipping)
  const dueValid = /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && dueDate >= todayIso()
  const emailValid = !billing.email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billing.email.trim())
  const billingValid =
    !needsBilling ||
    (BILLING_FIELDS.every((field) => !field.required || billing[field.key].trim()) && emailValid)
  const valid =
    parsed.every((p) => p !== null) && parsedShipping !== null && dueValid && billingValid
  const termDays = dueValid ? daysUntil(dueDate) : null

  const totals = useMemo(() => {
    if (!valid) return null
    const subtotal = round(
      order.items.reduce((sum, item, i) => sum + (parsed[i] ?? 0) * item.quantity, 0),
    )
    const net = round(subtotal + (parsedShipping ?? 0))
    const vat = round((net * PREVIEW_VAT_RATE) / 100)
    return { subtotal, net, vat, gross: round(net + vat) }
  }, [valid, parsed, parsedShipping, order.items])

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
              `${updated.reference} confirmed, but the invoice email to ${invoiceEmail} failed: ${delivery.error}${delivery.willRetry ? ' We will retry automatically.' : ' Use “Resend email” to try again.'}`,
            )
          } else {
            notifySaved(
              `${updated.reference} confirmed`,
              !updated.invoice
                ? undefined
                : delivery?.status === 'sent'
                  ? `Invoice ${updated.invoice.number} was sent to ${invoiceEmail}.`
                  : delivery?.status === 'queued'
                    ? `Invoice ${updated.invoice.number} is queued; no mail provider is configured.`
                    : `Invoice ${updated.invoice.number} was already issued.`,
            )
          }
          onOpenChange(false)
        },
        onError: (err) => notifyError(err, 'Could not confirm the order'),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Confirm {order.reference}</DialogTitle>
          <DialogDescription>
            Agree the final price. Prices are net, per unit — change any that
            differ from what the shop estimated.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
          {order.items.map((item, i) => (
            <div
              key={`${item.productId}-${i}`}
              className="grid grid-cols-[1fr_110px_90px] items-center gap-3 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {item.quantity} × · estimated {m(item.unitPrice)}
                </p>
              </div>
              <Input
                aria-label={`Unit price for ${item.name}`}
                inputMode="decimal"
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
          <div className="grid grid-cols-[1fr_110px_90px] items-center gap-3 border-t border-border/40 pt-3 text-sm">
            <Label htmlFor="confirm-shipping">Shipping</Label>
            <Input
              id="confirm-shipping"
              inputMode="decimal"
              value={shipping}
              onChange={(e) => setShipping(e.target.value)}
              className={parsedShipping === null ? 'border-destructive' : undefined}
            />
            <span className="text-right tabular-nums">
              {parsedShipping !== null ? m(parsedShipping) : '—'}
            </span>
          </div>
        </div>

        {totals && (
          <dl className="space-y-1 border-t border-border/40 pt-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <dt>Net</dt>
              <dd className="tabular-nums">{m(totals.net)}</dd>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <dt>VAT {PREVIEW_VAT_RATE} %</dt>
              <dd className="tabular-nums">{m(totals.vat)}</dd>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <dt>Invoice total</dt>
              <dd className="tabular-nums">{m(totals.gross)}</dd>
            </div>
          </dl>
        )}

        {needsBilling && (
          <fieldset className="space-y-3 border-t border-border/40 pt-3">
            <legend className="text-sm font-medium">Billing address</legend>
            <p className="text-xs text-muted-foreground">
              This request came in without one, so enter who the invoice is made
              out to. It is saved on the order. Germany only.
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
                      {field.label}
                      {!field.required && (
                        <span className="font-normal text-muted-foreground"> (optional)</span>
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

        <div className="grid grid-cols-[1fr_160px] items-center gap-3 border-t border-border/40 pt-3 text-sm">
          <div>
            <Label htmlFor="confirm-due">Payment due by</Label>
            <p
              id="confirm-due-hint"
              className={`text-xs ${dueValid ? 'text-muted-foreground' : 'text-destructive'}`}
            >
              {!dueValid
                ? 'Choose today or a later date.'
                : termDays === 0
                  ? 'Payable on receipt.'
                  : `${termDays} ${termDays === 1 ? 'day' : 'days'} from today — printed on the invoice.`}
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
          This issues a numbered invoice and emails it to{' '}
          <span className="font-medium">{invoiceEmail}</span>. The price cannot be
          changed afterwards — a mistake then needs a credit note.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || confirm.isPending}>
            {confirm.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            Confirm & send invoice
          </Button>
        </DialogFooter>
        {needsBilling && !billingValid && (
          <p className="-mt-2 text-right text-xs text-muted-foreground">
            Fill in company, street, postcode and city to confirm.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
