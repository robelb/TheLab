import { useBrand } from '@/context/BrandContext'
import { cn } from '@/lib/utils'

interface BrandSwitcherProps {
  className?: string
  /** compact = color dot + short label; full = pill tabs */
  variant?: 'compact' | 'full'
}

export function BrandSwitcher({
  className,
  variant = 'compact',
}: BrandSwitcherProps) {
  const { brands, activeBrandId, selectBrand } = useBrand()

  if (variant === 'full') {
    return (
      <div
        className={cn('flex flex-wrap gap-2', className)}
        role="tablist"
        aria-label="Select brand preset"
      >
        {brands.map((preset) => {
          const active = preset.id === activeBrandId
          return (
            <button
              key={preset.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectBrand(preset.id)}
              className={cn(
                'btn-brand-radius flex items-center gap-2 border px-4 py-2 text-sm font-medium transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-transparent text-muted-foreground hover:border-primary/50 hover:text-foreground',
              )}
            >
              <span
                className="size-3 shrink-0 rounded-full ring-1 ring-border"
                style={{ backgroundColor: preset.primaryColor }}
                aria-hidden
              />
              {preset.label}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div
      className={cn('flex items-center gap-1', className)}
      role="radiogroup"
      aria-label="Select brand"
    >
      {brands.map((preset) => {
        const active = preset.id === activeBrandId
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={preset.label}
            onClick={() => selectBrand(preset.id)}
            className={cn(
              'btn-brand-radius flex h-8 items-center gap-1.5 px-2 text-xs font-medium transition-colors',
              active
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-muted/20 hover:text-foreground',
            )}
          >
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: preset.primaryColor }}
              aria-hidden
            />
            <span className="hidden max-w-[4.5rem] truncate sm:inline">
              {preset.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
