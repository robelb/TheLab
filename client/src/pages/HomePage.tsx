import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useBrand } from '@/context/BrandContext'
import { useDebounce } from '@/hooks/use-debounce'
import { useProducts } from '@/hooks/use-products'
import { isPriceRangeFiltered } from '@/components/PriceRangeFilter'
import { ProductCard } from '@/components/ProductCard'
import { ProductGridSkeleton } from '@/components/ProductCardSkeleton'
import { ProductFilters } from '@/components/ProductFilters'
import { ProductSearchBar } from '@/components/ProductSearchBar'
import { ProductsListToolbar } from '@/components/ProductsListToolbar'
import { Button } from '@/components/ui/button'
import type { PageSize, PriceRange } from '@/types/product'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const SEARCH_DEBOUNCE_MS = 2000
const PRICE_DEBOUNCE_MS = 2000

export function HomePage() {
  const { session } = useAuth()
  const { brand } = useBrand()

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState<PageSize>(20)
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [priceBounds, setPriceBounds] = useState<PriceRange | undefined>()
  const [priceSelection, setPriceSelection] = useState<
    [number, number] | undefined
  >()

  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS)
  const debouncedPrice = useDebounce(priceSelection, PRICE_DEBOUNCE_MS)

  const priceFilterActive =
    priceBounds &&
    debouncedPrice &&
    isPriceRangeFiltered(priceBounds, debouncedPrice)

  const { data, isLoading, isFetching, error } = useProducts({
    page,
    limit,
    category: category !== 'all' ? category : undefined,
    q: debouncedSearch || undefined,
    minPrice: priceFilterActive ? debouncedPrice![0] : undefined,
    maxPrice: priceFilterActive ? debouncedPrice![1] : undefined,
    domain: session?.domain ?? undefined,
  })

  const products = data?.data ?? []
  const categories = data?.categories ?? []
  const pagination = data?.pagination
  const total = pagination?.total ?? 0
  const totalPages = pagination?.totalPages ?? 0
  const hasNextPage = pagination?.hasNextPage ?? false
  const hasPrevPage = pagination?.hasPrevPage ?? false

  if (data?.priceRange && !priceBounds) {
    setPriceBounds(data.priceRange)
    setPriceSelection([data.priceRange.min, data.priceRange.max])
  }

  function changeCategory(cat: string) {
    setCategory(cat)
    setPage(1)
  }

  function changeSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  function changePrice(value: [number, number]) {
    setPriceSelection(value)
    setPage(1)
  }

  function changeLimit(next: PageSize) {
    setLimit(next)
    setPage(1)
  }

  function clearAllFilters() {
    setCategory('all')
    setSearch('')
    if (priceBounds) {
      setPriceSelection([priceBounds.min, priceBounds.max])
    }
    setPage(1)
  }

  const loading = isLoading || isFetching
  const hasSearch = search.trim().length > 0
  const priceKey = priceFilterActive
    ? `${debouncedPrice![0]}-${debouncedPrice![1]}`
    : 'full'

  return (
    <div className="space-y-10">
      <section className="max-w-2xl space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          {brand.companyName} collection
        </p>
        <h1 className="font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Shop curated pieces
        </h1>
        <p className="text-lg text-muted-foreground">{brand.description}</p>
      </section>

      <ProductSearchBar value={search} onChange={changeSearch} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,15.5rem)_1fr] lg:items-start">
        <ProductFilters
          categories={categories}
          category={category}
          onCategoryChange={changeCategory}
          priceBounds={priceBounds}
          priceSelection={priceSelection}
          onPriceChange={changePrice}
          total={total}
          showing={products.length}
          loading={loading}
          hasSearch={hasSearch}
          onClearAll={clearAllFilters}
          className="lg:sticky lg:top-20"
        />

        <div className="min-w-0 space-y-6">
          <ProductsListToolbar
            showing={products.length}
            total={total}
            limit={limit}
            onLimitChange={changeLimit}
            loading={loading}
          />

          {error && (
            <p className="rounded-brand border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error instanceof Error ? error.message : 'Failed to load products'}
            </p>
          )}

          {isLoading ? (
            <ProductGridSkeleton count={limit} />
          ) : (
            <>
              <div
                className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4"
                key={`${category}-${page}-${limit}-${debouncedSearch}-${priceKey}`}
              >
                {products.map((product, i) => (
                  <ProductCard key={product.id} product={product} index={i} />
                ))}
              </div>

              {products.length === 0 && !error && (
                <div className="rounded-brand border border-dashed border-border/50 bg-card/30 px-6 py-16 text-center">
                  <p className="font-display text-lg font-semibold">
                    No matches
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Try another category, adjust price, or clear your search.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-6"
                    onClick={clearAllFilters}
                  >
                    Reset filters
                  </Button>
                </div>
              )}

              {totalPages > 1 && (
                <nav
                  className="flex flex-wrap items-center justify-center gap-3 border-t border-border/30 pt-8"
                  aria-label="Pagination"
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!hasPrevPage}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="size-4" />
                    Previous
                  </Button>
                  <span className="font-mono text-xs text-muted-foreground">
                    {page} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!hasNextPage}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                    <ChevronRight className="size-4" />
                  </Button>
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
