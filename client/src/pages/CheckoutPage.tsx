import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { usePostHog } from '@posthog/react'
import { Loader2 } from 'lucide-react'
import { useCart } from '@/context/CartContext'
import { useBrand } from '@/context/BrandContext'
import { useAuth } from '@/context/AuthContext'
import { useCreateOrder } from '@/hooks/use-orders'
import type { OrderItem } from '@/api/orders'
import { boxAllLines, shippingFor } from '@/lib/box'
import { loadAttribution } from '@/lib/attribution'
import { clearFunnelEntry, loadFunnelEntry } from '@/lib/funnel'
import { getGuestSessionId } from '@/lib/guest-session'
import { currentLocale } from '@/i18n'
import { apiErrorMessage } from '@/lib/notify'
import { formatPrice } from '@/utils/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'

/**
 * Asking for a box, not buying one.
 *
 * Money and invoicing happen outside this app, so nothing here charges anybody
 * and there is no card field — a payment form in a flow that never takes payment
 * teaches the wrong habit and collects details we have no business holding. What
 * this does is record the request, with everything needed to price and print it,
 * and hand back a reference to quote.
 */
export function CheckoutPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { brand } = useBrand()
  const { user, company } = useAuth()
  const { items, subtotal, clearCart } = useCart()
  const posthog = usePostHog()
  const createOrder = useCreateOrder()

  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  // A signed-in shopper's company is on their account; a guest has to say.
  const [companyName, setCompanyName] = useState(company?.name ?? '')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [zip, setZip] = useState('')
  const [country, setCountry] = useState('')
  const [neededBy, setNeededBy] = useState('')
  const [notes, setNotes] = useState('')

  /** Set once the request is recorded — carries the reference to quote. */
  const [reference, setReference] = useState<string | null>(null)

  const shipping = shippingFor(subtotal)
  const total = subtotal + shipping
  const currency = items[0]?.product.currency ?? 'EUR'

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
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
    const funnel = loadFunnelEntry()

    try {
      const order = await createOrder.mutateAsync({
        contact: {
          name: name.trim(),
          email: email.trim(),
          company: companyName.trim() || null,
          phone: phone.trim() || null,
        },
        delivery: {
          address: address.trim() || null,
          city: city.trim() || null,
          zip: zip.trim() || null,
          country: country.trim() || null,
          neededBy: neededBy.trim() || null,
          notes: notes.trim() || null,
        },
        items: payload,
        currency,
        locale: currentLocale(),
        source: funnel ? 'funnel' : 'storefront',
        collectionSlug: funnel?.collectionSlug ?? null,
        attribution: attribution
          ? {
              ...attribution,
              // Lets the ads side line a request up with the session that
              // produced it, without us sending anything more about them.
              posthogDistinctId: posthog?.get_distinct_id() ?? null,
              guestSessionId: user ? null : getGuestSessionId(),
            }
          : null,
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
        source: funnel ? 'funnel' : 'storefront',
        collection: funnel?.collectionSlug ?? null,
      })

      // Only now. Clearing before the request lands would throw the basket away
      // on a failure, and rebuilding a designed box is an afternoon's work.
      setReference(order.reference)
      clearCart()
      // The campaign brought them this far and has been recorded on the
      // request; a second order is a new visit, not the same click.
      clearFunnelEntry()
    } catch {
      // The error renders below; the cart and everything typed stay put.
    }
  }

  const error = createOrder.error
    ? apiErrorMessage(createOrder.error, t('common.somethingWentWrong'))
    : null

  if (items.length === 0 && !reference) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold">
          {t('checkout.nothing')}
        </h1>
        <Button asChild>
          <Link to="/">{t('checkout.continueShopping')}</Link>
        </Button>
      </div>
    )
  }

  if (reference) {
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
          <span className="font-medium text-foreground">{reference}</span>.{' '}
          {t('checkout.receivedBody')}
        </p>
        <Button onClick={() => navigate('/')}>{t('checkout.backToShop')}</Button>
      </div>
    )
  }

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
        <form className="space-y-8" onSubmit={handleSubmit}>
          <fieldset className="space-y-4" disabled={createOrder.isPending}>
            <legend className="font-display text-lg font-semibold">
              {t('checkout.contact')}
            </legend>
            <div className="space-y-2">
              <Label htmlFor="name">{t('checkout.name')}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('checkout.email')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="company">{t('checkout.company')}</Label>
                <Input
                  id="company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  autoComplete="organization"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  {t('checkout.companyHint')}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">{t('checkout.phone')}</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-4" disabled={createOrder.isPending}>
            <legend className="font-display text-lg font-semibold">
              {t('checkout.delivery')}
            </legend>
            <div className="space-y-2">
              <Label htmlFor="address">{t('checkout.address')}</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="city">{t('checkout.city')}</Label>
                <Input
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zip">{t('checkout.zip')}</Label>
                <Input
                  id="zip"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="country">{t('checkout.country')}</Label>
                <Input
                  id="country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  required
                />
              </div>
              {/* The first thing a quote has to answer, and the thing people
                  forget to mention until it is too late to make. */}
              <div className="space-y-2">
                <Label htmlFor="neededBy">{t('checkout.neededBy')}</Label>
                <Input
                  id="neededBy"
                  type="date"
                  value={neededBy}
                  onChange={(e) => setNeededBy(e.target.value)}
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-4" disabled={createOrder.isPending}>
            <legend className="font-display text-lg font-semibold">
              {t('checkout.anythingElse')}
            </legend>
            <div className="space-y-2">
              <Label htmlFor="notes">{t('checkout.notes')}</Label>
              <Textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('checkout.notesPlaceholder')}
              />
            </div>
          </fieldset>

          {error && (
            <p className="rounded-brand border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full sm:w-auto"
            disabled={createOrder.isPending}
          >
            {createOrder.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('checkout.sending')}
              </>
            ) : (
              t('checkout.send')
            )}
          </Button>
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
            <div className="flex justify-between font-semibold">
              <span>{t('checkout.estimatedTotal')}</span>
              <span>{formatPrice(total, currency)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('checkout.indicative')}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
