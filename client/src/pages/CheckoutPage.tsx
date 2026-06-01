import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '@/context/CartContext'
import { useBrand } from '@/context/BrandContext'
import { formatPrice } from '@/utils/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

export function CheckoutPage() {
  const navigate = useNavigate()
  const { brand } = useBrand()
  const { items, subtotal, clearCart } = useCart()
  const [submitted, setSubmitted] = useState(false)

  const shipping = subtotal >= 200 ? 0 : 12
  const total = subtotal + shipping

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitted(true)
    clearCart()
  }

  if (items.length === 0 && !submitted) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold">Nothing to checkout</h1>
        <Button asChild>
          <Link to="/">Continue shopping</Link>
        </Button>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
          ✓
        </span>
        <h1 className="font-display text-3xl font-bold">Thank you</h1>
        <p className="text-muted-foreground">
          Your {brand.companyName} order is confirmed. We&apos;ll email you
          shortly.
        </p>
        <Button onClick={() => navigate('/')}>Back to shop</Button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-bold">Checkout</h1>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px] lg:items-start">
        <form className="space-y-8" onSubmit={handleSubmit}>
          <fieldset className="space-y-4">
            <legend className="font-display text-lg font-semibold">Contact</legend>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="font-display text-lg font-semibold">Shipping</legend>
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" name="address" required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" name="city" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zip">ZIP</Label>
                <Input id="zip" name="zip" required />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="font-display text-lg font-semibold">Payment</legend>
            <p className="rounded-brand border-l-4 border-primary bg-primary/10 p-3 text-sm text-muted-foreground">
              Demo only — no real payment is processed.
            </p>
            <div className="space-y-2">
              <Label htmlFor="card">Card number</Label>
              <Input
                id="card"
                name="card"
                placeholder="4242 4242 4242 4242"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="expiry">Expiry</Label>
                <Input id="expiry" name="expiry" placeholder="MM/YY" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cvc">CVC</Label>
                <Input id="cvc" name="cvc" required />
              </div>
            </div>
          </fieldset>

          <Button type="submit" size="lg" className="w-full sm:w-auto">
            Place order — {formatPrice(total)}
          </Button>
        </form>

        <Card className="sticky top-24 border-border/30">
          <CardHeader>
            <CardTitle>Order summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2 text-sm">
              {items.map(({ product, quantity }) => (
                <li
                  key={product.id}
                  className="flex justify-between gap-2 text-muted-foreground"
                >
                  <span className="truncate">
                    {product.name} × {quantity}
                  </span>
                  <span className="shrink-0 text-foreground">
                    {formatPrice(product.price * quantity, product.currency)}
                  </span>
                </li>
              ))}
            </ul>
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{formatPrice(total)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
