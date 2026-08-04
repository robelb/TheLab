import { X } from 'lucide-react'
import { getProductDisplayImage } from '@/lib/productImage'
import { formatPrice } from '@/utils/format'
import type { Product } from '@/types/product'

interface CampaignProductTileProps {
  product: Product
  onRemove?: () => void
}

/** Read-only product tile for the campaign bundle (no cart, no navigation). */
export function CampaignProductTile({
  product,
  onRemove,
}: CampaignProductTileProps) {
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
        </p>
      </div>
    </div>
  )
}
