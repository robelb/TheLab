import { useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Loader2, ShoppingBag } from 'lucide-react'
import { usePostHog } from '@posthog/react'
import { useQueryClient } from '@tanstack/react-query'
import type { Product } from '@/types/product'
import { fetchProduct } from '@/api/products'
import { useCart } from '@/context/CartContext'
import { productsKeys } from '@/hooks/use-products'
import { bundleToBoxDetails } from '@/lib/box'
import { notifyError } from '@/lib/notify'
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
  /** How many go in with one click. */
  quantity?: number
}

export function AddToCartButton({
  product,
  className,
  disabled,
  size = 'lg',
  variant = 'default',
  compact = false,
  quantity = 1,
}: AddToCartButtonProps) {
  const { t } = useTranslation()
  const { addItem } = useCart()
  const posthog = usePostHog()
  const queryClient = useQueryClient()
  const [added, setAdded] = useState(false)
  const [loading, setLoading] = useState(false)

  /**
   * A box has to enter the cart as a box, parts and all, or checkout prices
   * and ships it as one anonymous item. Grid cards come from the catalogue
   * list, which leaves the parts out, so they are fetched here on the click —
   * through the product page's cache, so opening it afterwards is instant.
   */
  async function addBundle() {
    const full = product.components?.length
      ? product
      : await queryClient.fetchQuery({
          queryKey: productsKeys.detail(product.id),
          queryFn: () => fetchProduct(product.id),
        })
    addItem(full, quantity, bundleToBoxDetails(full) ?? undefined)
  }

  async function handleClick(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    e.stopPropagation()
    if (product.kind === 'bundle') {
      setLoading(true)
      try {
        await addBundle()
      } catch (err) {
        notifyError(err, t('card.addFailed'))
        return
      } finally {
        setLoading(false)
      }
    } else {
      // If this product was branded in the editor, its placement comes with it.
      addItem(
        product,
        quantity,
        undefined,
        readProductDesign(product.id) ?? undefined,
      )
    }
    setAdded(true)
    window.setTimeout(() => setAdded(false), 2000)
    posthog?.capture('product added to cart', {
      product_id: product.id,
      product_name: product.name,
      product_sku: product.sku,
      quantity,
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
      onClick={(e) => void handleClick(e)}
      disabled={outOfStock || loading}
      aria-live="polite"
    >
      {loading ? (
        <Loader2
          className={cn('animate-spin', compact ? 'size-3.5' : 'size-4')}
        />
      ) : added ? (
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
