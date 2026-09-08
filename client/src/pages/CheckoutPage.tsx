import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePostHog } from '@posthog/react'
import { Loader2 } from 'lucide-react'
import { useCart } from '@/context/CartContext'
import { useBrand } from '@/context/BrandContext'
import { useCreateOrder } from '@/hooks/use-orders'
import type { OrderItem } from '@/api/orders'
import { boxAllLines, shippingFor } from '@/lib/box'
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
  const { brand } = useBrand()
  const { items, subtotal, clearCart } = useCart()
  const posthog = usePostHog()
  const createOrder = useCreateOrder()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
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

    try {
      const order = await createOrder.mutateAsync({
        contact: { name: name.trim(), email: email.trim() },
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
      })

      posthog?.capture('order requested', {
        reference: order.reference,
        total: order.total,
        subtotal: order.subtotal,
        shipping: order.shipping,
        item_count: items.reduce((sum, i) => sum + i.quantity, 0),
        currency: order.currency,
        brand: brand.companyName,
      })

      // Only now. Clearing before the request lands would throw the basket away
      // on a failure, and rebuilding a designed box is an afternoon's work.
      setReference(order.reference)
      clearCart()
    } catch {
      // The error renders below; the cart and everything typed stay put.
    }
  }

  const error = createOrder.error
    ? ((createOrder.error as { response?: { data?: { error?: string } } }).response
        ?.data?.error ?? (createOrder.error as Error).message)
    : null

  if (items.length === 0 && !reference) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold">Nothing to request</h1>
        <Button asChild>
          <Link to="/">Continue shopping</Link>
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
        <h1 className="font-display text-3xl font-bold">Request received</h1>
        <p className="text-muted-foreground">
          Your reference is{' '}
          <span className="font-medium text-foreground">{reference}</span>. We
          have everything we need to price it, and we&apos;ll come back to you
          with a quote.
        </p>
        <Button onClick={() => navigate('/')}>Back to shop</Button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-bold">Request your box</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Tell us where it needs to go and when. We&apos;ll price it and come
          back to you with a quote — nothing is charged here.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px] lg:items-start">
        <form className="space-y-8" onSubmit={handleSubmit}>
          <fieldset className="space-y-4" disabled={createOrder.isPending}>
            <legend className="font-display text-lg font-semibold">Contact</legend>
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </fieldset>

          <fieldset className="space-y-4" disabled={createOrder.isPending}>
            <legend className="font-display text-lg font-semibold">Delivery</legend>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zip">ZIP</Label>
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
                <Label htmlFor="country">Country</Label>
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
                <Label htmlFor="neededBy">Needed by</Label>
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
              Anything else
            </legend>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Quantities you're still deciding on, a deadline, who it's for…"
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
                Sending…
              </>
            ) : (
              'Send request'
            )}
          </Button>
        </form>

        <Card className="sticky top-24 border-border/30">
          <CardHeader>
            <CardTitle>What you&apos;re asking for</CardTitle>
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
              <span>Estimated total</span>
              <span>{formatPrice(total, currency)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Indicative only — your quote is what counts.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
