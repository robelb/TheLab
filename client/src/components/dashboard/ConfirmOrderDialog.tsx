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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useConfirmOrder } from '@/hooks/use-orders'
import { notifyError, notifySaved } from '@/lib/notify'
import type { Order } from '@/api/orders'
import { formatPrice } from '@/utils/format'

/**
 * Shown so the total can be read before it is sent. The server applies its own
 * configured rate and its figures are the ones stored; this only previews them.
 */
const PREVIEW_VAT_RATE = 19

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

  const parsed = prices.map(parseAmount)
  const parsedShipping = parseAmount(shipping)
  const valid = parsed.every((p) => p !== null) && parsedShipping !== null

  const totals = useMemo(() => {
    if (!valid) return null
    const subtotal = round(
      order.items.reduce((sum, item, i) => sum + (parsed[i] ?? 0) * item.quantity, 0),
    )
    const net = round(subtotal + (parsedShipping ?? 0))
    const vat = round((net * PREVIEW_VAT_RATE) / 100)
    return { subtotal, net, vat, gross: round(net + vat) }
  }, [valid, parsed, parsedShipping, order.items])

  const invoiceEmail = order.billing?.email || order.contact.email
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
        },
      },
      {
        onSuccess: (updated) => {
          notifySaved(
            `${updated.reference} confirmed`,
            updated.invoice
              ? `Invoice ${updated.invoice.number} is on its way to ${invoiceEmail}.`
              : undefined,
          )
          onOpenChange(false)
        },
        onError: (err) => notifyError(err, 'Could not confirm the order'),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
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
      </DialogContent>
    </Dialog>
  )
}
