import { Minus, Plus, X } from 'lucide-react'
import { getProductDisplayImage } from '@/lib/productImage'
import { formatPrice } from '@/utils/format'
import type { Product } from '@/types/product'

interface CampaignProductTileProps {
  product: Product
  onRemove?: () => void
  /** How many of this product the bundle holds — omit for a plain tile. */
  quantity?: number
  /** Enables the stepper; never goes below 1, removal stays on the ✕. */
  onQuantityChange?: (quantity: number) => void
}

/** Read-only product tile for the campaign bundle (no cart, no navigation). */
export function CampaignProductTile({
  product,
  onRemove,
  quantity,
  onQuantityChange,
}: CampaignProductTileProps) {
  const showStepper = quantity !== undefined && Boolean(onQuantityChange)

  return (
    <div className="group relative overflow-hidden rounded-brand border border-border/40 bg-card">
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${product.name}`}
          onClick={onRemove}
          className="absolute right-1.5 top-1.5 z-10 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      )}
      <div className="aspect-square overflow-hidden bg-muted/10">
        <img
          src={getProductDisplayImage(product)}
          alt={product.name}
          className="h-full w-full object-contain p-2"
          loading="lazy"
        />
      </div>
      <div className="space-y-0.5 p-2">
        <p className="truncate text-xs font-medium">{product.name}</p>
        <p className="text-xs text-primary">
          {formatPrice(product.price, product.currency)}
          {showStepper && quantity > 1 && (
            <span className="text-muted-foreground">
              {' '}
              · {formatPrice(product.price * quantity, product.currency)} total
            </span>
          )}
        </p>
        {showStepper && (
          <div className="flex items-center justify-between pt-1.5">
            <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
              Qty
            </span>
            <div className="flex items-center rounded-brand border border-border">
              <button
                type="button"
                aria-label={`Decrease ${product.name} quantity`}
                disabled={quantity <= 1}
                onClick={() => onQuantityChange?.(quantity - 1)}
                className="flex size-6 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground"
              >
                <Minus className="size-3" />
              </button>
              <span className="min-w-6 text-center text-xs tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                aria-label={`Increase ${product.name} quantity`}
                onClick={() => onQuantityChange?.(quantity + 1)}
                className="flex size-6 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              >
                <Plus className="size-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
