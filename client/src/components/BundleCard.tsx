import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Minus, Pencil, Plus, ShoppingBag } from 'lucide-react'
import { usePostHog } from '@posthog/react'
import { useTranslation } from 'react-i18next'
import { useCart } from '@/context/CartContext'
import { useAuth } from '@/context/AuthContext'
import { bundleToBoxDetails } from '@/lib/box'
import { getProductDisplayImage } from '@/lib/productImage'
import { formatPrice } from '@/utils/format'
import type { Product } from '@/types/product'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ProductImage } from '@/components/ProductImage'

/**
 * A pre-configured box, ready to buy.
 *
 * The whole point of the funnel: somebody arriving from an ad should be able to
 * put a finished box in the basket without configuring anything. So the price,
 * the contents and the button are all on the card, and customising is the
 * second option rather than the only one.
 */
interface BundleCardProps {
  bundle: Product
  /**
   * Whether this page offers building a box. When it does not, the customise
   * button goes and the card links on with that fact attached, so the product
   * page does not offer what this page just withheld.
   */
  allowCustomization?: boolean
  /** The collection this card belongs to, carried to the product page. */
  collectionSlug?: string
}

export function BundleCard({
  bundle,
  allowCustomization = true,
  collectionSlug,
}: BundleCardProps) {
  const { t } = useTranslation()
  const { addItem } = useCart()
  const { brandGeneration } = useAuth()
  const posthog = usePostHog()
  const minQuantity = bundle.minQuantity ?? 1
  const [quantity, setQuantity] = useState(minQuantity)
  const [added, setAdded] = useState(false)

  const contents = (bundle.components ?? []).filter((c) => c.role === 'item')
  const detailUrl = collectionSlug
    ? `/product/${bundle.id}?from=${encodeURIComponent(collectionSlug)}`
    : `/product/${bundle.id}`


  function handleAdd() {
    const box = bundleToBoxDetails(bundle)
    if (!box) return
    addItem(bundle, quantity, box)
    setAdded(true)
    window.setTimeout(() => setAdded(false), 2000)
    posthog?.capture('bundle added to cart', {
      bundle_id: bundle.id,
      bundle_sku: bundle.sku,
      bundle_name: bundle.name,
      quantity,
      price: bundle.price,
      currency: bundle.currency,
    })
  }

  return (
    <Card className="flex h-full flex-col overflow-hidden border-border/30">
      <Link to={detailUrl} className="block bg-white">
        <ProductImage
          src={getProductDisplayImage(bundle, brandGeneration)}
          alt={bundle.name}
          className="aspect-4/3 w-full object-contain"
          loading="lazy"
        />
      </Link>

      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1">
          <Link
            to={detailUrl}
            className="font-display text-lg font-semibold hover:text-primary"
          >
            {bundle.name}
          </Link>
          <p className="text-sm text-muted-foreground">{bundle.tagline}</p>
        </div>

        {contents.length > 0 && (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {contents.map((component) => (
              <li key={component.product.id} className="flex gap-2">
                <span aria-hidden className="text-primary">
                  ·
                </span>
                <span className="min-w-0 truncate">
                  {component.quantity > 1 && `${component.quantity}× `}
                  {component.product.name}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto space-y-3 pt-2">
          <p className="font-display text-2xl font-bold text-primary">
            {formatPrice(bundle.price, bundle.currency)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              {t('common.each')}
            </span>
          </p>

          {minQuantity > 1 && (
            <p className="text-xs text-muted-foreground">
              {t('collection.minQuantity', { count: minQuantity })}
            </p>
          )}

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-brand border border-border">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-none"
                aria-label={t('cart.decrease')}
                disabled={quantity <= minQuantity}
                onClick={() => setQuantity((q) => Math.max(minQuantity, q - 1))}
              >
                <Minus className="size-4" />
              </Button>
              <span className="min-w-8 text-center text-sm tabular-nums">
                {quantity}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-none"
                aria-label={t('cart.increase')}
                onClick={() => setQuantity((q) => q + 1)}
              >
                <Plus className="size-4" />
              </Button>
            </div>

            <Button type="button" className="flex-1" onClick={handleAdd}>
              {added ? (
                <>
                  <Check className="size-4" />
                  {t('collection.added')}
                </>
              ) : (
                <>
                  <ShoppingBag className="size-4" />
                  {t('collection.addToCart')}
                </>
              )}
            </Button>
          </div>

          {allowCustomization ? (
            <Button asChild variant="ghost" size="sm" className="w-full">
              <Link to={`/build-box?bundle=${encodeURIComponent(bundle.id)}`}>
                <Pencil className="size-4" />
                {t('collection.customise')}
              </Link>
            </Button>
          ) : (
            <p className="text-center text-xs text-muted-foreground">
              {t('collection.buyOnlyNote')}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
