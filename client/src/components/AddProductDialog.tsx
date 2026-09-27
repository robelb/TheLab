import { useTranslation } from 'react-i18next'
import { Loader2, Package, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { useDebounce } from '@/hooks/use-debounce'
import { useProducts } from '@/hooks/use-products'
import { getProductDisplayImage } from '@/lib/productImage'
import type { Product } from '@/types/product'

interface AddProductDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Already picked — filtered out of the results. */
  existingIds: string[]
  /** Single-pick mode: called as soon as a product is clicked. */
  onAdd?: (product: Product) => void
  title?: string
  /**
   * Show plain catalogue photos rather than the company's branded variants —
   * for the box builder, where these products are about to be designed. See
   * `CampaignProductTile`.
   */
  plainImages?: boolean
  /** Narrow the search to ordinary items or to pre-configured boxes. */
  kind?: 'single' | 'bundle'
  /**
   * Pick several, then add them together.
   *
   * When given, a click ticks a product instead of adding it, and the footer
   * button hands over the whole selection in one call — so the caller can
   * save it in one request rather than one per product.
   */
  onAddMany?: (products: Product[]) => void | Promise<void>
  /** The most that may be ticked at once, e.g. the slots a list has left. */
  maxSelect?: number
  /**
   * Only products carrying this tag — a landing page's own range. `null`
   * means one applies but is not known yet, and holds the search until it is,
   * rather than showing the whole catalogue for a moment.
   */
  tag?: string | null
}

/**
 * Searchable product picker. Shared by the dashboard campaign editor and the
 * storefront box builder.
 */
export function AddProductDialog({
  open,
  onOpenChange,
  existingIds,
  onAdd,
  title,
  plainImages,
  kind,
  onAddMany,
  maxSelect,
  tag,
}: AddProductDialogProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const q = useDebounce(search, 400)
  // Sorted so the same set in a different order is the same cache entry, and
  // capped at what the server takes; past that, the filter below still hides
  // the rest, at the cost of a shorter page.
  const exclude = [...existingIds].sort().slice(0, 200)
  const { data, isFetching } = useProducts(
    {
      page: 1,
      limit: 20,
      q,
      kind,
      exclude,
      tag: tag ?? undefined,
    },
    { enabled: tag !== null },
  )
  // The server already left these out. This only covers the moment after an
  // add, while the previous page is still on screen and the new one loads.
  const products = (data?.data ?? []).filter((p) => !existingIds.includes(p.id))

  const multiple = Boolean(onAddMany)
  // Held as products, not ids, so a pick survives searching for something
  // else — the results it came from are no longer on screen by then.
  const [selected, setSelected] = useState<Map<string, Product>>(new Map())
  const [adding, setAdding] = useState(false)
  const full = maxSelect !== undefined && selected.size >= maxSelect

  function toggle(product: Product) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(product.id)) next.delete(product.id)
      else if (!full) next.set(product.id, product)
      return next
    })
  }

  // Every close starts the next open fresh, including one the caller does by
  // flipping `open` itself — otherwise ticks from picking boxes would still be
  // there when the same dialog opens to pick products.
  useEffect(() => {
    if (!open) {
      setSelected(new Map())
      setSearch('')
    }
  }, [open])

  async function addSelected() {
    if (!onAddMany || selected.size === 0) return
    setAdding(true)
    try {
      await onAddMany([...selected.values()])
      setSelected(new Map())
    } catch {
      // The caller has said what went wrong; the ticks stay so trying again
      // is one click rather than picking everything a second time.
    } finally {
      setAdding(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title ?? t('buildBox.addAProduct')}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('buildBox.searchProducts')}
            className="pl-9"
            autoFocus
          />
        </div>
        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {isFetching && products.length === 0 && (
            <Skeleton className="h-12 w-full" />
          )}
          {products.map((p) => {
            const checked = selected.has(p.id)
            const blocked = multiple && full && !checked
            return (
              <button
                key={p.id}
                type="button"
                role={multiple ? 'checkbox' : undefined}
                aria-checked={multiple ? checked : undefined}
                disabled={blocked}
                onClick={() => (multiple ? toggle(p) : onAdd?.(p))}
                className={cn(
                  'flex w-full items-center gap-3 rounded-brand p-2 text-left transition-colors hover:bg-muted/40',
                  checked && 'bg-primary/10 hover:bg-primary/15',
                  blocked && 'cursor-not-allowed opacity-50 hover:bg-transparent',
                )}
              >
                {multiple && (
                  <Checkbox
                    checked={checked}
                    tabIndex={-1}
                    aria-hidden
                    className="pointer-events-none"
                  />
                )}
                <img
                  src={plainImages ? p.image : getProductDisplayImage(p)}
                  alt=""
                  className="size-10 shrink-0 rounded-brand border border-border/40 object-cover"
                />
                <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                {/* Only worth saying when boxes and items share the list. */}
                {!kind && p.kind === 'bundle' && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    <Package className="size-3" />
                    {t('buildBox.boxBadge')}
                  </span>
                )}
                {!multiple && <Plus className="size-4 text-primary" />}
              </button>
            )
          })}
          {!isFetching && products.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('buildBox.noProductsFound')}
            </p>
          )}
        </div>
        {multiple && (
          <DialogFooter className="items-center gap-2 border-t border-border/40 pt-3 sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {full
                ? t('buildBox.selectedMax', { count: selected.size })
                : t('buildBox.selectedCount', { count: selected.size })}
            </p>
            <div className="flex gap-2">
              {selected.size > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={adding}
                  onClick={() => setSelected(new Map())}
                >
                  {t('buildBox.clearSelection')}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                disabled={selected.size === 0 || adding}
                onClick={() => void addSelected()}
              >
                {adding ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                {t('buildBox.addSelected', { count: selected.size })}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
