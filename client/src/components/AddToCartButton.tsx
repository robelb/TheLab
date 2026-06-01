import { useState, type MouseEvent } from 'react'
import { Check, ShoppingBag } from 'lucide-react'
import type { Product } from '@/types/product'
import { useCart } from '@/context/CartContext'
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
  const { addItem } = useCart()
  const [added, setAdded] = useState(false)

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    e.stopPropagation()
    addItem(product)
    setAdded(true)
    window.setTimeout(() => setAdded(false), 2000)
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
          Added
        </>
      ) : outOfStock ? (
        compact ? 'Sold out' : 'Out of stock'
      ) : (
        <>
          <ShoppingBag className={compact ? 'size-3.5' : 'size-4'} />
          {compact ? 'Add' : 'Add to cart'}
        </>
      )}
    </Button>
  )
}
