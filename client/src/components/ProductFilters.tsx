import { useMemo, useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  PriceRangeFilter,
  formatPriceRangeLabel,
  isPriceRangeFiltered,
} from '@/components/PriceRangeFilter'
import { cn } from '@/lib/utils'

interface ProductFiltersProps {
  categories: string[]
  category: string
  onCategoryChange: (category: string) => void
  priceBounds?: { min: number; max: number }
  priceSelection?: [number, number]
  onPriceChange?: (value: [number, number]) => void
  brandColor?: string
  colorSortActive?: boolean
  onBrandColorChange?: (hex: string) => void
  onColorSortToggle?: (active: boolean) => void
  total: number
  showing: number
  loading?: boolean
  className?: string
  onClearAll: () => void
  hasSearch?: boolean
}

export function ProductFilters({
  categories,
  category,
  onCategoryChange,
  priceBounds,
  priceSelection,
  onPriceChange,
  brandColor,
  colorSortActive = false,
  onBrandColorChange,
  onColorSortToggle,
  total,
  showing,
  loading,
  className,
  onClearAll,
  hasSearch = false,
}: ProductFiltersProps) {
  const [categoryQuery, setCategoryQuery] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)

  const filteredCategories = useMemo(() => {
    const q = categoryQuery.trim().toLowerCase()
    if (!q) return categories
    return categories.filter((cat) => cat.toLowerCase().includes(q))
  }, [categories, categoryQuery])

  const hasPriceFilter =
    priceBounds &&
    priceSelection &&
    isPriceRangeFiltered(priceBounds, priceSelection)

  const hasActiveFilters =
    category !== 'all' || hasPriceFilter || hasSearch
  const activeCount =
    (category !== 'all' ? 1 : 0) +
    (hasPriceFilter ? 1 : 0) +
    (hasSearch ? 1 : 0)

  function clearAll() {
    onClearAll()
    setCategoryQuery('')
    setMobileOpen(false)
  }

  function pickCategory(cat: string) {
    onCategoryChange(cat)
    setMobileOpen(false)
  }

  function resetPrice() {
    if (priceBounds && onPriceChange) {
      onPriceChange([priceBounds.min, priceBounds.max])
    }
  }

  const panel = (
    <div className="flex flex-col gap-5">
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Category
        </p>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-9 items-center justify-center">
            <Search
              className="size-3.5 shrink-0 text-foreground/45"
              strokeWidth={2}
              aria-hidden
            />
          </div>
          <Input
            type="search"
            value={categoryQuery}
            onChange={(e) => setCategoryQuery(e.target.value)}
            placeholder="Filter categories…"
            className="relative h-9 border-border/40 bg-background/40 pl-9 text-xs"
            aria-label="Filter category list"
          />
        </div>
        <nav
          className="max-h-52 space-y-0.5 overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:thin]"
          aria-label="Product categories"
        >
          <CategoryOption
            label="All products"
            active={category === 'all'}
            onClick={() => pickCategory('all')}
          />
          {filteredCategories.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">
              No categories match.
            </p>
          ) : (
            filteredCategories.map((cat) => (
              <CategoryOption
                key={cat}
                label={cat}
                active={category === cat}
                onClick={() => pickCategory(cat)}
              />
            ))
          )}
        </nav>
      </div>

      {priceBounds && priceSelection && onPriceChange && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Price range
          </p>
          <PriceRangeFilter
            bounds={priceBounds}
            value={priceSelection}
            onChange={onPriceChange}
          />
        </div>
      )}

      {onBrandColorChange && onColorSortToggle && (
        <div className="space-y-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Brand color
          </p>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={colorSortActive}
              onCheckedChange={(c) => onColorSortToggle(c === true)}
            />
            <span>Sort by closest color to my CI</span>
          </label>
          <div
            className={cn(
              'flex items-center gap-2 transition-opacity',
              colorSortActive ? 'opacity-100' : 'opacity-50',
            )}
          >
            <input
              type="color"
              value={brandColor ?? '#2563eb'}
              onChange={(e) => onBrandColorChange(e.target.value)}
              disabled={!colorSortActive}
              aria-label="Brand color"
              className="h-8 w-10 cursor-pointer rounded-brand border border-border/40 bg-transparent p-0.5 disabled:cursor-not-allowed"
            />
            <span className="font-mono text-xs uppercase text-muted-foreground">
              {brandColor ?? '#2563eb'}
            </span>
          </div>
        </div>
      )}

      <div className="border-t border-border/40 pt-4">
        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 h-8 w-full justify-start gap-2 px-0 text-xs text-muted-foreground hover:text-foreground"
            onClick={clearAll}
          >
            <X className="size-3.5" />
            Clear {activeCount} filter{activeCount === 1 ? '' : 's'}
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <aside className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-2 lg:hidden">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 border-border/50 bg-card/60"
          onClick={() => setMobileOpen((o) => !o)}
          aria-expanded={mobileOpen}
        >
          <SlidersHorizontal className="size-4" />
          Filters
          {activeCount > 0 && (
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
        {!loading && (
          <p className="text-xs text-muted-foreground">
            {showing} / {total}
          </p>
        )}
      </div>

      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 lg:hidden">
          {category !== 'all' && (
            <FilterChip
              label={category}
              onRemove={() => onCategoryChange('all')}
            />
          )}
          {hasPriceFilter && priceBounds && priceSelection && (
            <FilterChip
              label={formatPriceRangeLabel(priceBounds, priceSelection)}
              onRemove={resetPrice}
            />
          )}
        </div>
      )}

      <div
        className={cn(
          'rounded-brand border border-border/40 bg-card/50 p-4 shadow-brand backdrop-blur-sm',
          'lg:block',
          mobileOpen ? 'block' : 'hidden',
        )}
      >
        <div className="mb-4 hidden items-center gap-2 lg:flex">
          <SlidersHorizontal className="size-4 text-primary" aria-hidden />
          <h2 className="font-display text-sm font-semibold tracking-tight">
            Browse
          </h2>
        </div>
        {panel}
      </div>
    </aside>
  )
}

function CategoryOption({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'btn-brand-radius flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
        active
          ? 'border-l-2 border-primary bg-primary/10 font-medium text-foreground'
          : 'border-l-2 border-transparent text-muted-foreground hover:bg-muted/15 hover:text-foreground',
      )}
      aria-current={active ? 'true' : undefined}
    >
      <span className="line-clamp-2 capitalize">{label}</span>
    </button>
  )
}

function FilterChip({
  label,
  onRemove,
}: {
  label: string
  onRemove: () => void
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/50 bg-background/80 py-0.5 pl-2.5 pr-1 text-xs capitalize">
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 text-muted-foreground hover:bg-muted/30 hover:text-foreground"
        aria-label={`Remove ${label} filter`}
      >
        <X className="size-3" />
      </button>
    </span>
  )
}
