import { Minus, Plus, Wand2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  /** Opens the design editor for this product. Omit for a plain tile. */
  onDesign?: () => void
  /** The design already made for it, shown in place of the catalogue photo. */
  designImage?: string | null
  /**
   * Show the plain catalogue photo rather than the company's branded variant.
   *
   * For the box builder, where every product is something you are about to
   * design: a pre-branded tile looks finished when nothing has been placed yet,
   * and hides the bare surface you would be designing on. A design the shopper
   * actually made still wins over both.
   */
  plainImage?: boolean
}

/** Read-only product tile for the campaign bundle (no cart, no navigation). */
export function CampaignProductTile({
  product,
  onRemove,
  quantity,
  onQuantityChange,
  onDesign,
  designImage,
  plainImage,
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
      <div className="relative aspect-square overflow-hidden bg-muted/10">
        <img
          src={
            designImage ?? (plainImage ? product.image : getProductDisplayImage(product))
          }
          alt={product.name}
          className="h-full w-full object-contain p-2"
          loading="lazy"
        />
        {onDesign && (
          <Button
            type="button"
            size="sm"
            variant={designImage ? 'default' : 'secondary'}
            onClick={onDesign}
            // Always visible, designed or not. Hiding it until hover put the
            // one thing these tiles exist for behind a gesture that does not
            // exist on touch, and left the grid looking like a plain list of
            // products rather than a set of things waiting to be branded.
            className="absolute bottom-1.5 left-1.5 h-7 px-2 text-xs shadow-sm"
          >
            <Wand2 className="size-3" />
            {designImage ? 'Edit design' : 'Design'}
          </Button>
        )}
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
