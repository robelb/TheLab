import { Check } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatPrice } from '@/utils/format'
import type { Product } from '@/types/product'

interface SupplyPickerProps {
  label: string
  hint: string
  options: Product[]
  selectedId: string | null
  onSelect: (product: Product) => void
  loading?: boolean
  /** Overrides the selected tile's thumbnail — e.g. a customised box design. */
  previewImage?: string | null
}

/**
 * Pick exactly one box, or one filling material. Every built box needs both, so
 * there's no "none" option — the first (cheapest) is selected by default and
 * the shopper trades up from there.
 */
export function SupplyPicker({
  label,
  hint,
  options,
  selectedId,
  onSelect,
  loading = false,
  previewImage,
}: SupplyPickerProps) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-muted-foreground">
        {label}
      </legend>
      <p className="text-xs text-muted-foreground">{hint}</p>

      {loading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-brand" />
          ))}
        </div>
      ) : options.length === 0 ? (
        <p className="rounded-brand border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
          None available — ask an admin to seed the {label.toLowerCase()}.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {options.map((option) => {
            const selected = option.id === selectedId
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                title={option.description || option.name}
                onClick={() => onSelect(option)}
                className={cn(
                  'relative flex items-center gap-2 overflow-hidden rounded-brand border p-2 text-left transition-colors',
                  selected
                    ? 'border-primary bg-primary/5'
                    : 'border-border/40 hover:border-border',
                )}
              >
                <img
                  src={
                    // The shopper's own printed design when they have one,
                    // otherwise the plain board. Never the catalogue's branded
                    // variant: a box is designable, so showing it pre-branded
                    // reads as finished — see `BoxLine.customizedImage`.
                    (selected && previewImage) || option.image
                  }
                  alt=""
                  className="size-10 shrink-0 rounded-brand bg-muted/20 object-contain"
                  loading="lazy"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">
                    {option.name}
                  </span>
                  <span className="block text-xs text-primary">
                    {formatPrice(option.price, option.currency)}
                  </span>
                </span>
                {selected && (
                  <Check className="size-3.5 shrink-0 text-primary" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </fieldset>
  )
}
