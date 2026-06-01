import { PAGE_SIZE_OPTIONS, type PageSize } from '@/types/product'
import { cn } from '@/lib/utils'

interface ProductsListToolbarProps {
  showing: number
  total: number
  limit: PageSize
  onLimitChange: (limit: PageSize) => void
  loading?: boolean
  className?: string
}

export function ProductsListToolbar({
  showing,
  total,
  limit,
  onLimitChange,
  loading,
  className,
}: ProductsListToolbarProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-b border-border/30 pb-4',
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">
        {loading ? (
          'Updating results…'
        ) : (
          <>
            Showing{' '}
            <span className="font-medium text-foreground">{showing}</span> of{' '}
            <span className="font-medium text-foreground">{total}</span>
          </>
        )}
      </p>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Per page</span>
        <div
          className="inline-flex rounded-brand border border-border/50 bg-card/40 p-0.5"
          role="group"
          aria-label="Products per page"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => onLimitChange(size)}
              className={cn(
                'btn-brand-radius min-w-9 px-2.5 py-1 text-xs font-medium transition-colors',
                limit === size
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              aria-pressed={limit === size}
            >
              {size}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
