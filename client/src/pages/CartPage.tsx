import { Link } from 'react-router-dom'
import { Minus, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { useBrand } from '@/context/BrandContext'
import { boxPieceCount, isBoxSku } from '@/lib/box'
import { getProductDisplayImage } from '@/lib/productImage'
import { formatPrice } from '@/utils/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

export function CartPage() {
  const { brand } = useBrand()
  const { brandGeneration } = useAuth()
  const { items, updateQuantity, removeItem, subtotal, itemCount } = useCart()

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <h1 className="font-display text-3xl font-bold">Your cart is empty</h1>
        <p className="max-w-sm text-muted-foreground">
          Browse the {brand.companyName} collection and add something you love.
        </p>
        <Button asChild size="lg">
          <Link to="/">Browse collection</Link>
        </Button>
      </div>
    )
  }

  const shipping = subtotal >= 200 ? 0 : 12
  const total = subtotal + shipping

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-3xl font-bold">Cart</h1>
        <span className="text-sm text-muted-foreground">
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </span>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px] lg:items-start">
        <ul className="divide-y divide-border/40">
          {items.map(({ product, quantity, box }) => {
            // A built box is a client-side line item, not a catalog product —
            // its detail page is the box builder, opened on this very box.
            // Boxes added before contents were tracked just open the builder.
            const editBoxUrl = `/build-box?edit=${encodeURIComponent(product.id)}`
            const productUrl = box
              ? editBoxUrl
              : isBoxSku(product.sku)
                ? '/build-box'
                : `/product/${product.id}`
            return (
            <li
              key={product.id}
              className="grid grid-cols-[88px_1fr] gap-4 py-6 sm:grid-cols-[100px_1fr_auto]"
            >
              <Link
                to={productUrl}
                className="overflow-hidden rounded-brand"
              >
                <img
                  src={getProductDisplayImage(product, brandGeneration)}
                  alt=""
                  className="aspect-[4/5] w-full object-cover sm:aspect-square sm:h-[100px] sm:w-[100px]"
                />
              </Link>

              <div className="min-w-0">
                <div className="space-y-1">
                  <Link
                    to={productUrl}
                    className="font-display text-lg font-semibold hover:text-primary"
                  >
                    {product.name}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {product.tagline}
                  </p>
                  <p className="font-semibold text-primary">
                    {formatPrice(product.price * quantity, product.currency)}
                  </p>
                </div>

                {/* A box is one line, so what it holds is spelled out here. */}
                {box && box.lines.length > 0 && (
                  <div className="mt-3 rounded-brand border border-border/40 bg-muted/5 p-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Inside this box · {boxPieceCount(box.lines)} item
                      {boxPieceCount(box.lines) === 1 ? '' : 's'}
                    </p>
                    <ul className="space-y-2">
                      {box.lines.map((line) => (
                        <li
                          key={line.productId}
                          className="flex items-center gap-2.5 text-sm"
                        >
                          <img
                            src={getProductDisplayImage(line, brandGeneration)}
                            alt=""
                            className="size-9 shrink-0 rounded-brand border border-border/40 bg-background object-contain"
                            loading="lazy"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate">{line.name}</p>
                            <p className="text-xs tabular-nums text-muted-foreground">
                              {formatPrice(line.price, line.currency)} ×{' '}
                              {line.quantity}
                            </p>
                          </div>
                          <span className="shrink-0 tabular-nums font-medium">
                            {formatPrice(
                              line.price * line.quantity,
                              line.currency,
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {/* The box and its filling are charged alongside the
                        contents, so they're itemised rather than folded in. */}
                    {(box.packaging || box.filling) && (
                      <ul className="mt-2 space-y-1 border-t border-border/40 pt-2">
                        {[box.packaging, box.filling]
                          .filter((line) => Boolean(line))
                          .map((line) => (
                            <li
                              key={line!.productId}
                              className="flex items-center gap-2 text-xs text-muted-foreground"
                            >
                              <span className="min-w-0 flex-1 truncate">
                                {line!.name}
                              </span>
                              <span className="shrink-0 tabular-nums">
                                {formatPrice(
                                  line!.price * line!.quantity,
                                  line!.currency,
                                )}
                              </span>
                            </li>
                          ))}
                      </ul>
                    )}
                    {quantity > 1 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Per box — you have {quantity} of these boxes.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="col-span-2 flex items-center justify-between gap-4 sm:col-span-1 sm:flex-col sm:items-end">
                <div className="flex items-center rounded-brand border border-border">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-none"
                    aria-label="Decrease quantity"
                    onClick={() => updateQuantity(product.id, quantity - 1)}
                  >
                    <Minus className="size-4" />
                  </Button>
                  <span className="min-w-8 text-center text-sm">{quantity}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-none"
                    aria-label="Increase quantity"
                    onClick={() => updateQuantity(product.id, quantity + 1)}
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-1 sm:flex-col sm:items-end">
                  {box && (
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                    >
                      <Link to={editBoxUrl}>
                        <Pencil className="size-4" />
                        Edit box
                      </Link>
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => removeItem(product.id)}
                  >
                    <Trash2 className="size-4" />
                    Remove
                  </Button>
                </div>
              </div>
            </li>
            )
          })}
        </ul>

        <Card className="sticky top-24 border-border/30">
          <CardHeader>
            <CardTitle>Order summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Shipping</span>
              <span>
                {shipping === 0 ? 'Free' : formatPrice(shipping)}
              </span>
            </div>
            {subtotal < 200 && (
              <p className="text-xs text-primary">
                Free shipping on orders over {formatPrice(200)}
              </p>
            )}
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{formatPrice(total)}</span>
            </div>
            <Button asChild className="mt-2 w-full" size="lg">
              <Link to="/checkout">Proceed to checkout</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
