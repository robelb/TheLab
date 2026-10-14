import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { usePostHog } from '@posthog/react'
import { isAxiosError } from 'axios'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronRight, Loader2 } from 'lucide-react'
import { useCart } from '@/context/CartContext'
import { useBrand } from '@/context/BrandContext'
import { useAuth } from '@/context/AuthContext'
import { useCreateOrder } from '@/hooks/use-orders'
import type { OrderItem } from '@/api/orders'
import { boxAllLines, boxPieceCount, cartLineCatalogueId } from '@/lib/box'
import { productsKeys } from '@/hooks/use-products'
import { shippingCost, vatRateFor, isEu } from '@/lib/shipping'
import {
  attributionProperties,
  clearAttribution,
  loadAttribution,
} from '@/lib/attribution'
import { clearCampaignLock, clearFunnelEntry, loadFunnelEntry } from '@/lib/funnel'
import { useFunnel } from '@/context/FunnelContext'
import { getGuestSessionId } from '@/lib/guest-session'
import { currentLocale } from '@/i18n'
import { formatPrice } from '@/utils/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { FormAlert } from '@/components/ui/form-field'
import { useZodForm } from '@/lib/form'
import { makeCheckoutSchema, type CheckoutValues } from '@/lib/schemas/checkout'
import {
  BillingSection,
  ContactSection,
  DeliverySection,
  emptyCheckoutForm,
  PaymentSection,
  PrivacyConsent,
  type CheckoutForm,
} from '@/components/checkout/CheckoutSections'
import type { TFunction } from 'i18next'

/**
 * What has been typed into the checkout, kept for this tab so a reload — or a
 * trip back to the cart — does not throw it away. Never the privacy consent:
 * that is given fresh each time. Cleared once the request is sent.
 */
const CHECKOUT_FORM_KEY = 'atelier-checkout-form'
const SHIPPING_METHODS = ['bulk', 'individual', 'mixed'] as const

function loadSavedForm(base: CheckoutForm): CheckoutForm {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_FORM_KEY)
    if (!raw) return base
    const saved = JSON.parse(raw) as Record<string, unknown>
    if (!saved || typeof saved !== 'object') return base
    const next: Record<string, unknown> = { ...base }
    // Field by field, and only as the type it should be: storage is untrusted.
    for (const key of Object.keys(base) as (keyof CheckoutForm)[]) {
      if (key === 'privacyAccepted') continue
      const value = saved[key]
      if (typeof value !== typeof base[key]) continue
      if (
        key === 'shippingMethod' &&
        !(SHIPPING_METHODS as readonly unknown[]).includes(value)
      ) {
        continue
      }
      next[key] = value
    }
    return next as unknown as CheckoutForm
  } catch {
    return base
  }
}

function saveForm(values: CheckoutForm): void {
  try {
    const { privacyAccepted: _consent, ...rest } = values
    sessionStorage.setItem(CHECKOUT_FORM_KEY, JSON.stringify(rest))
  } catch {
    // Private mode or a full quota: the form still works, it just won't
    // survive a reload.
  }
}

function forgetForm(): void {
  try {
    sessionStorage.removeItem(CHECKOUT_FORM_KEY)
  } catch {
    // Nothing to forget.
  }
}

/**
 * What to tell the shopper when the request was refused — in their language,
 * by what went wrong rather than in the server's English. `toCart` when the
 * fix is in the cart.
 */
function checkoutError(err: unknown, t: TFunction): { message: string; toCart?: boolean } {
  if (!isAxiosError(err)) return { message: t('common.somethingWentWrong') }
  if (!err.response) return { message: t('errors.NETWORK') }
  const { status } = err.response
  const code = (err.response.data as { code?: string } | undefined)?.code
  if (code === 'unknown_product' || code === 'unavailable_product') {
    return { message: t('checkout.errors.unavailable'), toCart: true }
  }
  if (code === 'below_minimum') {
    return { message: t('checkout.errors.belowMinimum'), toCart: true }
  }
  if (code === 'collection_unavailable') {
    return { message: t('checkout.errors.collectionUnavailable') }
  }
  if (status === 429) return { message: t('errors.RATE_LIMITED') }
  if (status === 400) return { message: t('checkout.errors.checkDetails') }
  return { message: t('common.somethingWentWrong') }
}

/**
 * Asking for a box — an order request, not a purchase.
 *
 * Nothing is charged here and nothing is binding yet. The request lands with
 * everything an invoice needs; a super admin then confirms it in the dashboard,
 * agreeing the final price, and only then is the invoice issued and emailed.
 * Payment is by bank transfer against that invoice, which is why there is no
 * card field: a payment form in a flow that takes no payment teaches the wrong
 * habit and collects details we have no business holding.
 */
export function CheckoutPage() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  // A request sent from inside a campaign leaves them in it — and says which.
  const { shopHome, collectionSlug } = useFunnel()
  const { brand } = useBrand()
  const { user, company } = useAuth()
  const { items, subtotal, clearCart, hasUnavailable } = useCart()
  const posthog = usePostHog()
  const createOrder = useCreateOrder()
  const queryClient = useQueryClient()

  // Gift boxes, counting each box line's quantity: what shipping is per.
  const boxes = items.reduce((sum, i) => sum + (i.box ? i.quantity : 0), 0)
  // Single products travel with a bulk shipment, so they rule out sending
  // every box on its own (the server refuses that combination too).
  const looseItems = items.some((i) => !i.box)

  // Rebuilt when the language or the box count changes, so the messages and
  // the mixed-shipping limit follow them.
  const schema = useMemo(
    () => makeCheckoutSchema(t, boxes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, i18n.language, boxes],
  )
  const f = useZodForm({
    schema,
    initialValues: () =>
      loadSavedForm(
        emptyCheckoutForm({
          name: user?.name,
          email: user?.email,
          // A signed-in shopper's company is on their account; a guest has to say.
          company: company?.name,
        }),
      ),
  })
  useEffect(() => saveForm(f.values), [f.values])

  /** Set once the request is recorded — carries the reference to quote. */
  const [sent, setSent] = useState<{ reference: string; email: string } | null>(null)

  const v = f.values
  const method =
    boxes === 0 || (looseItems && v.shippingMethod === 'individual') ? 'bulk' : v.shippingMethod
  const destination =
    v.sameAsBilling && method !== 'individual' ? v.country : v.deliveryCountry
  // Null outside the countries we ship to; the form says so where it matters,
  // and the summary shows no figure rather than a free delivery.
  const shippingEstimate = shippingCost({
    method,
    country: destination,
    boxes,
    bulkBoxes: Number(v.bulkBoxes) || null,
  })
  const shipping = shippingEstimate ?? 0
  const total = subtotal + shipping
  const vatRate = vatRateFor(v.country)
  const vat = Math.round(total * vatRate) / 100
  const currency = items[0]?.product.currency ?? 'EUR'

  // Once per visit to the page, so the funnel shows where people drop off.
  const started = useRef(false)
  useEffect(() => {
    if (started.current || items.length === 0) return
    started.current = true
    posthog?.capture('checkout started', {
      collection: collectionSlug,
      source: collectionSlug ? 'funnel' : 'storefront',
      estimated_total: total,
      item_count: items.reduce((sum, i) => sum + i.quantity, 0),
      is_guest: !user,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Only ever called with values that passed the schema — see `useZodForm`. */
  async function submit(form: CheckoutValues) {
    if (createOrder.isPending || hasUnavailable) return

    const payload: OrderItem[] = items.map((item) => {
      const { product, quantity, box, design } = item
      return {
      // The catalogue product, not the cart's own id for the line: a second
      // copy of a ready-made box sits in the cart under an id of its own.
      productId: cartLineCatalogueId(item),
      name: product.name,
      sku: product.sku ?? null,
      // A branded line is represented by its own artwork. The line's picture
      // is what the dashboard shows against the request, and a catalogue photo
      // there described a product nobody ordered.
      image:
        design?.flat ??
        design?.image ??
        product.customizedImage ??
        product.image ??
        null,
      // Shown until the server prices it; it never takes this figure.
      unitPrice: Math.round(item.unitPrice * 100) / 100,
      quantity,
      currency: product.currency ?? null,
      box: box ?? null,
      design: design ?? null,
      }
    })

    // Where they came from, gathered at the one moment it is worth something.
    const attribution = loadAttribution()
    const entry = loadFunnelEntry()
    const trim = (v: string) => v.trim() || null
    const name = `${form.firstName.trim()} ${form.lastName.trim()}`.trim()

    try {
      const order = await createOrder.mutateAsync({
        contact: {
          name,
          firstName: trim(form.firstName),
          lastName: trim(form.lastName),
          email: form.email.trim(),
          company: trim(form.company),
          phone: trim(form.phone),
          position: trim(form.position),
        },
        billing: {
          company: form.company.trim(),
          name,
          street: form.street.trim(),
          line2: trim(form.line2),
          zip: form.zip.trim(),
          city: form.city.trim(),
          country: form.country,
          vatId: form.vatId || null,
          poNumber: trim(form.poNumber),
        },
        delivery: {
          sameAsBilling: form.sameAsBilling,
          ...(form.sameAsBilling || method === 'individual'
            ? { country: method === 'individual' ? form.deliveryCountry : form.country }
            : {
                address: trim(form.deliveryStreet),
                line2: trim(form.deliveryLine2),
                zip: trim(form.deliveryZip),
                city: trim(form.deliveryCity),
                country: form.deliveryCountry,
              }),
          neededBy: trim(form.neededBy),
          notes: trim(form.notes),
        },
        shipping: {
          method,
          bulkBoxes: method === 'mixed' ? Number(form.bulkBoxes) : null,
        },
        items: payload,
        currency,
        locale: currentLocale(),
        // The page they are buying in; the server checks it and decides the
        // source from it.
        collectionSlug: collectionSlug ?? null,
        attribution: {
          ...(attribution ?? {}),
          // Lets the ads side line a request up with the session that
          // produced it, without us sending anything more about them.
          posthogDistinctId: posthog?.get_distinct_id() ?? null,
          guestSessionId: user ? null : getGuestSessionId(),
          entrySlug:
            entry && entry.collectionSlug !== collectionSlug
              ? entry.collectionSlug
              : null,
        },
        paymentMethod: 'invoice',
        privacyAccepted: form.privacyAccepted,
      })

      posthog?.capture('order requested', {
        reference: order.reference,
        total: order.total,
        subtotal: order.subtotal,
        shipping: order.shipping,
        item_count: items.reduce((sum, i) => sum + i.quantity, 0),
        currency: order.currency,
        brand: brand.companyName,
        is_guest: !user,
        source: order.source ?? (collectionSlug ? 'funnel' : 'storefront'),
        collection: order.collectionSlug ?? null,
        collection_name: order.collectionName ?? null,
        payment_method: 'invoice',
      })

      // Only now. Clearing before the request lands would throw the basket away
      // on a failure, and rebuilding a designed box is an afternoon's work.
      setSent({ reference: order.reference, email: order.contact.email })
      clearCart()
      forgetForm()
      // The click that brought them has been recorded on the request; a
      // second order is a new visit, not the same click. Only the attribution
      // goes — they stay inside the campaign itself.
      clearFunnelEntry()
      clearAttribution()
      for (const key of Object.keys(attributionProperties(attribution))) {
        posthog?.unregister(key)
      }
    } catch (err) {
      // A request that did not go through is a shopper we are about to lose,
      // so it is counted — without anything they typed.
      posthog?.capture('order request failed', {
        http_status: isAxiosError(err) ? (err.response?.status ?? null) : null,
        error_code: isAxiosError(err)
          ? ((err.response?.data as { code?: string } | undefined)?.code ?? null)
          : null,
        item_count: items.reduce((sum, i) => sum + i.quantity, 0),
        estimated_total: total,
        collection: collectionSlug,
        is_guest: !user,
      })
      // The campaign ended while they were checking out: let go of it so the
      // cart can be sent from the shop. The cart and everything typed stay.
      if (
        isAxiosError(err) &&
        err.response?.status === 409 &&
        (err.response.data as { code?: string } | undefined)?.code ===
          'collection_unavailable'
      ) {
        clearCampaignLock()
        clearFunnelEntry()
      }
      // Something in the cart is gone: look the cart up again, so the line
      // that has to go is marked there.
      if (isAxiosError(err) && err.response?.status === 409) {
        void queryClient.invalidateQueries({ queryKey: [...productsKeys.all, 'by-ids'] })
      }
      // The error renders below.
    }
  }

  const error = createOrder.error ? checkoutError(createOrder.error, t) : null

  if (items.length === 0 && !sent) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold">
          {t('checkout.nothing')}
        </h1>
        <Button asChild>
          <Link to={shopHome}>{t('checkout.continueShopping')}</Link>
        </Button>
      </div>
    )
  }

  if (sent) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
          ✓
        </span>
        <h1 className="font-display text-3xl font-bold">
          {t('checkout.received')}
        </h1>
        <p className="text-muted-foreground">
          {t('checkout.referenceIs')}{' '}
          <span className="font-medium text-foreground">{sent.reference}</span>.
        </p>
        <p className="text-muted-foreground">
          {t('checkout.confirmationSent', { email: sent.email })}
        </p>
        <p className="text-sm text-muted-foreground">{t('checkout.receivedBody')}</p>
        <Button onClick={() => navigate(shopHome)}>
          {t('checkout.backToShop')}
        </Button>
      </div>
    )
  }

  const pending = createOrder.isPending

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-bold">
          {t('checkout.title')}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t('checkout.intro')}
        </p>
        {/* Said out loud, because the thing that stopped people getting this
            far was being asked to make an account first. */}
        {!user && (
          <p className="text-sm font-medium text-primary">
            {t('checkout.noAccountNeeded')}
          </p>
        )}
      </div>

      {/* The summary sits beside the form on a wide screen. On a phone it
          comes between the form and the button, so the total is read before
          sending rather than found after it — hence the button lives outside
          the <form>, tied to it by `form`. */}
      <div className="grid gap-8 lg:grid-cols-[1fr_340px] lg:items-start">
        {/* `noValidate`: the schema checks everything, in the shopper's
            language, instead of the browser's own bubbles. */}
        <form
          id="checkout-form"
          className="space-y-8 lg:col-start-1 lg:row-start-1"
          onSubmit={f.handleSubmit(submit)}
          noValidate
        >
          <ContactSection f={f} disabled={pending} />
          <BillingSection f={f} disabled={pending} />
          <DeliverySection
            f={f}
            disabled={pending}
            boxes={boxes}
            looseItems={looseItems}
            currency={currency}
          />
          <PaymentSection disabled={pending} />

          <PrivacyConsent f={f} disabled={pending} />
        </form>

        <Card className="border-border lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <CardHeader>
            <CardTitle>{t('checkout.asking')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2 text-sm">
              {items.map(({ product, quantity, box, unitPrice, lineTotal, unavailable }) => (
                <li key={product.id} className="space-y-1">
                  <div className="flex justify-between gap-2 text-muted-foreground">
                    <span className="min-w-0">
                      <span className="block truncate">
                        {product.name} × {quantity}
                      </span>
                      {quantity > 1 && (
                        <span className="block text-xs">
                          {formatPrice(unitPrice, product.currency)} {t('common.each')}
                        </span>
                      )}
                      {unavailable && (
                        <span className="flex items-center gap-1 text-xs text-destructive">
                          <AlertTriangle className="size-3 shrink-0" />
                          {t('checkout.errors.lineUnavailable')}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-foreground">
                      {formatPrice(lineTotal, product.currency)}
                    </span>
                  </div>
                  {/* A box ships as one line, so what's in it — packaging and
                      filling included, since both are charged for — is one
                      click away rather than spelled out, which turned a
                      summary of two boxes into a parts list. */}
                  {box && (
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                        <ChevronRight className="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
                        {t('cart.insideBox')} ·{' '}
                        {t('common.item', { count: boxPieceCount(box.lines) })}
                      </summary>
                      <ul className="mt-1 ml-1.5 border-l border-border pl-3 text-xs text-muted-foreground">
                        {boxAllLines(box).map((line) => (
                          <li key={line.productId} className="truncate">
                            {line.name} × {line.quantity}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
            <Separator />
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>{t('checkout.subtotal')}</span>
                <span>{formatPrice(subtotal, currency)}</span>
              </div>
              <div className="flex justify-between gap-3 text-muted-foreground">
                <span>
                  {t('checkout.shipping')}
                  <span className="block text-xs">
                    {t(`checkout.shipMethodShort.${method}`)}
                  </span>
                </span>
                <span>
                  {shippingEstimate === null ? '—' : formatPrice(shipping, currency)}
                </span>
              </div>
              <div className="flex justify-between gap-3 text-muted-foreground">
                <span>
                  {t('checkout.vat', { rate: vatRate })}
                  {vatRate === 0 && (
                    <span className="block text-xs">
                      {isEu(v.country)
                        ? t('checkout.vatZeroEu')
                        : t('checkout.vatZeroNonEu')}
                    </span>
                  )}
                </span>
                <span>{formatPrice(vat, currency)}</span>
              </div>
            </div>
            <div className="flex justify-between font-semibold">
              <span>{t('checkout.estimatedTotal')}</span>
              <span>{formatPrice(total + vat, currency)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('checkout.plusVat')} {t('checkout.indicative')}
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-start-1 lg:row-start-2">
          {hasUnavailable ? (
            <FormAlert>
              {t('checkout.errors.unavailableInCart')}{' '}
              <Link to="/cart" className="font-medium underline underline-offset-2">
                {t('checkout.errors.backToCart')}
              </Link>
            </FormAlert>
          ) : f.errorCount > 0 ? (
            <FormAlert>{t('validation.summary', { count: f.errorCount })}</FormAlert>
          ) : (
            error && (
              <FormAlert>
                {error.message}
                {error.toCart && (
                  <>
                    {' '}
                    <Link to="/cart" className="font-medium underline underline-offset-2">
                      {t('checkout.errors.backToCart')}
                    </Link>
                  </>
                )}
              </FormAlert>
            )
          )}

          <div className="space-y-2">
            <Button
              type="submit"
              form="checkout-form"
              size="lg"
              className="w-full sm:w-auto"
              disabled={pending || hasUnavailable}
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('checkout.sending')}
                </>
              ) : (
                t('checkout.send')
              )}
            </Button>
            <p className="text-xs text-muted-foreground">{t('checkout.notBinding')}</p>
          </div>
        </div>

      </div>
    </div>
  )
}
