import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { uploadLogoFile } from '@/api/uploads'
import { useUpdateOrderDetails } from '@/hooks/use-orders'
import { notifyError, notifySaved } from '@/lib/notify'
import { countryName } from '@/lib/orderOps'
import { INVOICE_COUNTRIES } from '@/lib/shipping'
import type { Order, OrderBilling, OrderDetailsBody } from '@/api/orders'
import type { StickerLogo } from '@/types/box'

type BillingForm = Required<{ [K in keyof OrderBilling]: string }>

function billingForm(b: OrderBilling | null | undefined): BillingForm {
  return {
    company: b?.company ?? '',
    name: b?.name ?? '',
    street: b?.street ?? '',
    line2: b?.line2 ?? '',
    zip: b?.zip ?? '',
    city: b?.city ?? '',
    country: b?.country ?? 'DE',
    vatId: b?.vatId ?? '',
    poNumber: b?.poNumber ?? '',
    email: b?.email ?? '',
  }
}

/**
 * Fill in what the customer sends after the request: a PO number, a corrected
 * invoice address, "the recipient addresses have arrived", the sticker logo.
 * Only before the order is confirmed — the invoice is made out from these.
 */
export function OrderDetailsDialog({
  order,
  open,
  onOpenChange,
}: {
  order: Order
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const save = useUpdateOrderDetails()
  const initial = billingForm(order.billing)
  const [billing, setBilling] = useState<BillingForm>(initial)
  const [addressesIn, setAddressesIn] = useState(!order.addressesLater)
  // Box lines that carry stickers, with the logo each has (or is getting).
  const stickerLines = order.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.box?.stickers)
  const [logos, setLogos] = useState<Record<number, StickerLogo | null>>(() =>
    Object.fromEntries(stickerLines.map(({ item, index }) => [index, item.box?.stickerLogo ?? null])),
  )
  const [uploading, setUploading] = useState<number | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const uploadFor = useRef<number | null>(null)

  const set = (key: keyof BillingForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setBilling((b) => ({ ...b, [key]: e.target.value }))

  const pickLogo = (index: number) => {
    uploadFor.current = index
    fileInput.current?.click()
  }
  const onFile = async (file: File | undefined) => {
    const index = uploadFor.current
    if (!file || index === null) return
    setUploading(index)
    try {
      const url = await uploadLogoFile(file)
      setLogos((l) => ({ ...l, [index]: { url, name: file.name } }))
    } catch (err) {
      notifyError(err, t('dashboard.orders.details.uploadFailed'))
    } finally {
      setUploading(null)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const submit = () => {
    const body: OrderDetailsBody = {}
    const changed = (Object.keys(billing) as (keyof BillingForm)[]).filter(
      (key) => billing[key].trim() !== initial[key].trim(),
    )
    if (changed.length) {
      body.billing = Object.fromEntries(changed.map((key) => [key, billing[key].trim()]))
    }
    if (addressesIn === Boolean(order.addressesLater)) body.addressesLater = !addressesIn
    const logoChanges = stickerLines
      .filter(({ item, index }) => (item.box?.stickerLogo?.url ?? null) !== (logos[index]?.url ?? null))
      .map(({ index }) => ({ index, logo: logos[index] ?? null }))
    if (logoChanges.length) body.stickerLogos = logoChanges

    if (!body.billing && body.addressesLater === undefined && !body.stickerLogos) {
      onOpenChange(false)
      return
    }
    save.mutate(
      { id: order.id, body },
      {
        onSuccess: () => {
          notifySaved(t('dashboard.orders.details.saved', { reference: order.reference }))
          onOpenChange(false)
        },
        onError: (err) => notifyError(err, t('dashboard.orders.details.failed')),
      },
    )
  }

  const field = (key: keyof BillingForm, label: string, extra?: { optional?: boolean }) => (
    <div className="space-y-1.5">
      <Label htmlFor={`details-${key}`}>
        {label}
        {extra?.optional && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {t('dashboard.orders.details.optional')}
          </span>
        )}
      </Label>
      <Input id={`details-${key}`} value={billing[key]} onChange={set(key)} />
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('dashboard.orders.details.title', { reference: order.reference })}</DialogTitle>
          <DialogDescription>{t('dashboard.orders.details.description')}</DialogDescription>
        </DialogHeader>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">{t('dashboard.orders.details.invoice')}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {field('poNumber', t('dashboard.orders.details.poNumber'), { optional: true })}
            {field('vatId', t('dashboard.orders.details.vatId'), { optional: true })}
            {field('company', t('dashboard.orders.details.company'))}
            {field('name', t('dashboard.orders.details.name'), { optional: true })}
            {field('street', t('dashboard.orders.details.street'))}
            {field('line2', t('dashboard.orders.details.line2'), { optional: true })}
            {field('zip', t('dashboard.orders.details.zip'))}
            {field('city', t('dashboard.orders.details.city'))}
            <div className="space-y-1.5">
              <Label htmlFor="details-country">{t('dashboard.orders.details.country')}</Label>
              <select
                id="details-country"
                value={billing.country}
                onChange={set('country')}
                className="h-10 w-full rounded-brand border border-input bg-background px-3 text-sm"
              >
                {INVOICE_COUNTRIES.map((code) => (
                  <option key={code} value={code}>
                    {countryName(code)}
                  </option>
                ))}
              </select>
            </div>
            {field('email', t('dashboard.orders.details.email'), { optional: true })}
          </div>
        </section>

        {order.shippingMethod && order.shippingMethod !== 'bulk' && (
          <section className="space-y-2 border-t border-border/40 pt-4">
            <h3 className="text-sm font-semibold">{t('dashboard.orders.details.recipients')}</h3>
            <div className="flex items-center gap-2">
              <Checkbox
                id="details-addresses"
                checked={addressesIn}
                onCheckedChange={(c) => setAddressesIn(c === true)}
              />
              <Label htmlFor="details-addresses" className="font-normal">
                {t('dashboard.orders.details.addressesReceived')}
              </Label>
            </div>
          </section>
        )}

        {stickerLines.length > 0 && (
          <section className="space-y-2 border-t border-border/40 pt-4">
            <h3 className="text-sm font-semibold">{t('dashboard.orders.details.stickerLogo')}</h3>
            {stickerLines.map(({ item, index }) => {
              const logo = logos[index]
              return (
                <div
                  key={index}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-brand border border-border/40 px-3 py-2"
                >
                  <div className="min-w-0 text-sm">
                    <p className="truncate font-medium">{item.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {logo ? (logo.name ?? logo.url) : t('dashboard.orders.details.noLogo')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {logo && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={t('dashboard.orders.details.removeLogo')}
                        onClick={() => setLogos((l) => ({ ...l, [index]: null }))}
                      >
                        <X className="size-4" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={uploading !== null}
                      onClick={() => pickLogo(index)}
                    >
                      {uploading === index ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Upload className="size-4" />
                      )}
                      {logo
                        ? t('dashboard.orders.details.replaceLogo')
                        : t('dashboard.orders.details.uploadLogo')}
                    </Button>
                  </div>
                </div>
              )
            })}
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,application/pdf"
              className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </section>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            {t('dashboard.orders.details.cancel')}
          </Button>
          <Button onClick={submit} disabled={save.isPending || uploading !== null}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            {t('dashboard.orders.details.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
