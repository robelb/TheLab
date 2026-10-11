import { useTranslation } from 'react-i18next'
import { Check, Loader2, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ProductImage } from '@/components/ProductImage'
import { ProductLabels } from '@/components/ProductLabels'
import { Skeleton } from '@/components/ui/skeleton'
import { useDebounce } from '@/hooks/use-debounce'
import { useTaggedProducts } from '@/hooks/use-products'
import { cn } from '@/lib/utils'
import { formatPrice } from '@/utils/format'
import type { Product } from '@/types/product'

interface ProductPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * The collection's tag: the picker shows its whole range and nothing else.
   * `null` is a collection whose tag is still loading; undefined is the shop,
   * where the whole catalogue is on offer.
   */
  tag: string | null | undefined
  /** Already in the box — shown, but marked and not pickable again. */
  existingIds: string[]
  /** Everything ticked, in one call. */
  onAdd: (products: Product[]) => void
  title: string
  description?: string
}

/**
 * The step builder's product picker: the collection's whole range as a grid
 * of large cards — photo, price, short description and diet badges — so
 * choosing reads like browsing a catalogue rather than searching a list.
 * Several can be ticked and added at once.
 */
export function ProductPickerDialog({
  open,
  onOpenChange,
  tag,
  existingIds,
  onAdd,
  title,
  description,
}: ProductPickerDialogProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const q = useDebounce(search, 300).trim()
  const catalogue = useTaggedProducts(tag ?? undefined, {
    kind: 'single',
    q,
    everything: tag === undefined,
  })
  const products = catalogue.data?.pages.flatMap((page) => page.data) ?? []
  const total = catalogue.data?.pages[0]?.pagination.total ?? 0

  // Held as products, not ids, so a pick survives searching for something else.
  const [selected, setSelected] = useState<Map<string, Product>>(new Map())

  useEffect(() => {
    if (!open) {
      setSelected(new Map())
      setSearch('')
    }
  }, [open])

  // The rest of the range loads as the shopper scrolls towards it. The marker
  // is held in state, not a ref: the dialog mounts its content after this
  // component renders, and the watcher has to start when the marker appears —
  // with the first page already cached nothing else would re-run it.
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = catalogue
  useEffect(() => {
    if (!sentinel || !hasNextPage) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage()
      },
      { rootMargin: '400px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [sentinel, hasNextPage, isFetchingNextPage, fetchNextPage, products.length])

  function toggle(product: Product) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(product.id)) next.delete(product.id)
      else next.set(product.id, product)
      return next
    })
  }

  function add() {
    if (selected.size === 0) return
    onAdd([...selected.values()])
    setSelected(new Map())
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <DialogHeader className="space-y-3 border-b border-border/40 p-4 pr-12 sm:p-6 sm:pr-14">
          <div className="space-y-1">
            <DialogTitle className="font-display text-2xl">{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('stepBuilder.picker.search')}
              aria-label={t('stepBuilder.picker.search')}
              className="pl-9"
            />
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {catalogue.isPending ? (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-brand" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {q
                ? t('stepBuilder.picker.noMatches', { q })
                : t('stepBuilder.picker.empty')}
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                {t('stepBuilder.picker.count', { count: total })}
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                {products.map((p) => (
                  <PickerCard
                    key={p.id}
                    product={p}
                    inBox={existingIds.includes(p.id)}
                    checked={selected.has(p.id)}
                    onToggle={() => toggle(p)}
                  />
                ))}
              </div>
              <div ref={setSentinel} className="flex justify-center py-6">
                {isFetchingNextPage ? (
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                ) : (
                  hasNextPage && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void fetchNextPage()}
                    >
                      {t('stepBuilder.picker.more')}
                    </Button>
                  )
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 bg-background p-4 sm:px-6">
          <p className="text-sm text-muted-foreground">
            {t('stepBuilder.picker.selected', { count: selected.size })}
          </p>
          <div className="flex gap-2">
            {selected.size > 0 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSelected(new Map())}
              >
                {t('stepBuilder.picker.clear')}
              </Button>
            )}
            <Button type="button" disabled={selected.size === 0} onClick={add}>
              <Plus className="size-4" />
              {t('stepBuilder.picker.add', { count: selected.size })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PickerCard({
  product,
  inBox,
  checked,
  onToggle,
}: {
  product: Product
  inBox: boolean
  checked: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const tiered = (product.graduatedPrices?.length ?? 0) > 0
  // The short description when there is one, else the start of the long one.
  const blurb = product.tagline || product.description

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={inBox}
      onClick={onToggle}
      className={cn(
        'group relative flex items-stretch gap-4 overflow-hidden rounded-brand border bg-card p-3 text-left transition-colors sm:gap-5',
        checked
          ? 'border-primary ring-2 ring-primary'
          : 'border-border/40 hover:border-border',
        inBox && 'cursor-default opacity-60',
      )}
    >
      {/* A fixed square the photo fills, whatever its own shape — a tall
          bottle must not stretch the card. */}
      <div className="relative aspect-square w-28 shrink-0 self-start overflow-hidden rounded-brand bg-muted/10 sm:w-36">
        <ProductImage
          src={product.image}
          alt={product.name}
          className="absolute inset-0 h-full w-full object-contain p-2"
        />
        <span
          aria-hidden
          className={cn(
            'absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full border-2 bg-background transition-colors',
            checked || inBox
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border',
          )}
        >
          {(checked || inBox) && <Check className="size-3.5" />}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-1">
        <p className="line-clamp-2 font-semibold leading-snug">{product.name}</p>
        {blurb && (
          <p className="line-clamp-4 text-sm leading-relaxed text-foreground/80">{blurb}</p>
        )}
        <ProductLabels labels={product.labels} />
        <p className="mt-auto pt-1 font-semibold tabular-nums">
          {formatPrice(product.price, product.currency)}
          {tiered && (
            <span className="ml-1.5 text-xs font-normal text-primary">
              {t('stepBuilder.picker.volumePricing')}
            </span>
          )}
        </p>
        {inBox && (
          <p className="text-xs text-primary">{t('stepBuilder.picker.inBox')}</p>
        )}
      </div>
    </button>
  )
}
