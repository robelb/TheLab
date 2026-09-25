import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { usePostHog } from '@posthog/react'
import { isAxiosError } from 'axios'
import { Loader2 } from 'lucide-react'
import { useCart } from '@/context/CartContext'
import { useBrand } from '@/context/BrandContext'
import { useAuth } from '@/context/AuthContext'
import { useCreateOrder } from '@/hooks/use-orders'
import type { OrderItem } from '@/api/orders'
import { boxAllLines, shippingFor, VAT_RATE, vatFor } from '@/lib/box'
import {
  attributionProperties,
  clearAttribution,
  loadAttribution,
} from '@/lib/attribution'
import { clearCampaignLock, clearFunnelEntry, loadFunnelEntry } from '@/lib/funnel'
import { useFunnel } from '@/context/FunnelContext'
import { getGuestSessionId } from '@/lib/guest-session'
import { currentLocale } from '@/i18n'
import { apiErrorMessage } from '@/lib/notify'
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
} from '@/components/checkout/CheckoutSections'

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
  const { items, subtotal, clearCart } = useCart()
  const posthog = usePostHog()
  const createOrder = useCreateOrder()

  // Rebuilt when the language changes, so the messages follow it.
  const schema = useMemo(
    () => makeCheckoutSchema(t),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, i18n.language],
  )
  const f = useZodForm({
    schema,
    initialValues: () =>
      emptyCheckoutForm({
        name: user?.name,
        email: user?.email,
        // A signed-in shopper's company is on their account; a guest has to say.
        company: company?.name,
      }),
  })

  /** Set once the request is recorded — carries the reference to quote. */
  const [sent, setSent] = useState<{ reference: string; email: string } | null>(null)

  const shipping = shippingFor(subtotal)
  const total = subtotal + shipping
  const vat = vatFor(total)
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
    if (createOrder.isPending) return

    const payload: OrderItem[] = items.map(({ product, quantity, box, design }) => ({
      productId: product.id,
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
      unitPrice: product.price,
      quantity,
      currency: product.currency ?? null,
      box: box ?? null,
      design: design ?? null,
    }))

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
          vatId: trim(form.vatId),
          poNumber: trim(form.poNumber),
        },
        delivery: {
          sameAsBilling: form.sameAsBilling,
          ...(form.sameAsBilling
            ? {}
            : {
                address: trim(form.deliveryStreet),
                line2: trim(form.deliveryLine2),
                zip: trim(form.deliveryZip),
                city: trim(form.deliveryCity),
                country: form.country,
              }),
          neededBy: trim(form.neededBy),
          notes: trim(form.notes),
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
      // The error renders below.
    }
  }

  const error = createOrder.error
    ? apiErrorMessage(createOrder.error, t('common.somethingWentWrong'))
    : null

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

      <div className="grid gap-8 lg:grid-cols-[1fr_340px] lg:items-start">
        {/* `noValidate`: the schema checks everything, in the shopper's
            language, instead of the browser's own bubbles. */}
        <form className="space-y-8" onSubmit={f.handleSubmit(submit)} noValidate>
          <ContactSection f={f} disabled={pending} />
          <BillingSection f={f} disabled={pending} />
          <DeliverySection f={f} disabled={pending} />
          <PaymentSection disabled={pending} />

          <PrivacyConsent f={f} disabled={pending} />

          {f.errorCount > 0 ? (
            <FormAlert>{t('validation.summary', { count: f.errorCount })}</FormAlert>
          ) : (
            error && <FormAlert>{error}</FormAlert>
          )}

          <div className="space-y-2">
            <Button
              type="submit"
              size="lg"
              className="w-full sm:w-auto"
              disabled={pending}
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
        </form>

        <Card className="sticky top-24 border-border/30">
          <CardHeader>
            <CardTitle>{t('checkout.asking')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2 text-sm">
              {items.map(({ product, quantity, box }) => (
                <li key={product.id} className="space-y-1">
                  <div className="flex justify-between gap-2 text-muted-foreground">
                    <span className="truncate">
                      {product.name} × {quantity}
                    </span>
                    <span className="shrink-0 text-foreground">
                      {formatPrice(product.price * quantity, product.currency)}
                    </span>
                  </div>
                  {/* A box ships as one line — say what's in it, packaging
                      and filling included, since both are charged for. */}
                  {box && (
                    <ul className="ml-2 border-l border-border/40 pl-3 text-xs text-muted-foreground">
                      {boxAllLines(box).map((line) => (
                        <li key={line.productId} className="truncate">
                          {line.name} × {line.quantity}
                        </li>
                      ))}
                    </ul>
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
              <div className="flex justify-between text-muted-foreground">
                <span>{t('checkout.shipping')}</span>
                <span>
                  {shipping === 0
                    ? t('checkout.shippingFree')
                    : formatPrice(shipping, currency)}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>{t('checkout.vat', { rate: VAT_RATE })}</span>
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
      </div>
    </div>
  )
}
