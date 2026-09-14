import { useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ShoppingBag } from 'lucide-react'
import { usePostHog } from '@posthog/react'
import type { Product } from '@/types/product'
import { useCart } from '@/context/CartContext'
import { readProductDesign } from '@/lib/productDesign'
import { Button, type ButtonProps } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface AddToCartButtonProps {
  product: Product
  className?: string
  disabled?: boolean
  size?: ButtonProps['size']
  variant?: ButtonProps['variant']
  /** Shorter label for compact surfaces (e.g. product cards). */
  compact?: boolean
}

export function AddToCartButton({
  product,
  className,
  disabled,
  size = 'lg',
  variant = 'default',
  compact = false,
}: AddToCartButtonProps) {
  const { t } = useTranslation()
  const { addItem } = useCart()
  const posthog = usePostHog()
  const [added, setAdded] = useState(false)

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    e.stopPropagation()
    // If this product was branded in the editor, its placement comes with it.
    addItem(product, 1, undefined, readProductDesign(product.id) ?? undefined)
    setAdded(true)
    window.setTimeout(() => setAdded(false), 2000)
    posthog?.capture('product added to cart', {
      product_id: product.id,
      product_name: product.name,
      product_sku: product.sku,
      price: product.price,
      currency: product.currency,
      category_id: product.category,
    })
  }

  const outOfStock = disabled || product.stock === 0

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={cn(
        compact ? 'shrink-0 gap-1.5' : 'w-full uppercase tracking-wider',
        className,
      )}
      onClick={handleClick}
      disabled={outOfStock}
      aria-live="polite"
    >
      {added ? (
        <>
          <Check className={compact ? 'size-3.5' : 'size-4'} />
          {t('card.added')}
        </>
      ) : outOfStock ? (
        compact ? t('card.soldOut') : t('card.outOfStock')
      ) : (
        <>
          <ShoppingBag className={compact ? 'size-3.5' : 'size-4'} />
          {compact ? t('card.addShort') : t('card.addToCart')}
        </>
      )}
    </Button>
  )
}
