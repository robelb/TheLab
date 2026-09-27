import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Pencil, ShoppingBag } from 'lucide-react'
import { usePostHog } from '@posthog/react'
import { useTranslation } from 'react-i18next'
import { useCart } from '@/context/CartContext'
import { useAuth } from '@/context/AuthContext'
import { bundleToBoxDetails } from '@/lib/box'
import { getProductDisplayImage } from '@/lib/productImage'
import { formatPrice } from '@/utils/format'
import type { Product } from '@/types/product'
import { Button } from '@/components/ui/button'
import { ProductImage } from '@/components/ProductImage'
import { QuantityStepper } from '@/components/QuantityStepper'

/**
 * A pre-configured box, as a landing page leads with it.
 *
 * Laid out like the marketing site's own box row — the photo does the
 * selling, then a name and a net price — with the basket right underneath, so
 * somebody arriving from an ad can put a finished box in it without
 * configuring anything. The contents are on the product page.
 */
interface BundleCardProps {
  bundle: Product
  /**
   * Whether this page offers building a box. When it does not, the customise
   * link goes and the card links on with that fact attached, so the product
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
    <article className="group flex h-full flex-col items-center text-center">
      <Link
        to={detailUrl}
        className="block w-full overflow-hidden rounded-brand bg-white"
        tabIndex={-1}
        aria-hidden
      >
        <ProductImage
          src={getProductDisplayImage(bundle, brandGeneration)}
          alt=""
          className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          loading="lazy"
        />
      </Link>

      <h3 className="mt-5 font-display text-xl font-bold leading-tight tracking-tight sm:text-2xl">
        <Link to={detailUrl} className="hover:text-primary">
          {bundle.name}
        </Link>
      </h3>

      <p className="mt-2 text-base text-foreground/80">
        {formatPrice(bundle.price, bundle.currency)} {t('collection.exclVat')}
      </p>

      {minQuantity > 1 && (
        <p className="mt-1 text-xs text-muted-foreground">
          {t('collection.minQuantity', { count: minQuantity })}
        </p>
      )}

      <div className="mt-auto flex w-full flex-col items-center gap-2 pt-4">
        <div className="flex w-full items-center gap-2">
          <QuantityStepper
            value={quantity}
            onChange={setQuantity}
            min={minQuantity}
          />
          <Button type="button" className="min-w-0 flex-1" onClick={handleAdd}>
            {added ? (
              <>
                <Check className="size-4" />
                <span className="truncate">{t('collection.added')}</span>
              </>
            ) : (
              <>
                <ShoppingBag className="size-4" />
                <span className="truncate">{t('collection.addToCart')}</span>
              </>
            )}
          </Button>
        </div>
        {allowCustomization && (
          <Button asChild variant="ghost" size="sm">
            <Link to={`/build-box?bundle=${encodeURIComponent(bundle.id)}`}>
              <Pencil className="size-4" />
              {t('collection.customise')}
            </Link>
          </Button>
        )}
      </div>
    </article>
  )
}
