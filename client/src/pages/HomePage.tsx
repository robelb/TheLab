import { useCallback, useEffect, useState } from 'react'
import { fetchProducts } from '@/api/products'
import { useBrand } from '@/context/BrandContext'
import { ProductCard } from '@/components/ProductCard'
import { ProductFilters } from '@/components/ProductFilters'
import { ProductSearchBar } from '@/components/ProductSearchBar'
import { ProductsListToolbar } from '@/components/ProductsListToolbar'
import { isPriceRangeFiltered } from '@/components/PriceRangeFilter'
import { Button } from '@/components/ui/button'
import type { PageSize, PriceRange, Product } from '@/types/product'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

export function HomePage() {
  const { brand } = useBrand()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [priceBounds, setPriceBounds] = useState<PriceRange | undefined>()
  const [priceSelection, setPriceSelection] = useState<[number, number] | undefined>()
  const [debouncedPriceSelection, setDebouncedPriceSelection] = useState<
    [number, number] | undefined
  >()
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState<PageSize>(20)
  const [totalPages, setTotalPages] = useState(0)
  const [total, setTotal] = useState(0)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [hasPrevPage, setHasPrevPage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedPriceSelection(priceSelection),
      400,
    )
    return () => window.clearTimeout(timer)
  }, [priceSelection])

  const priceFilterActive =
    priceBounds &&
    debouncedPriceSelection &&
    isPriceRangeFiltered(priceBounds, debouncedPriceSelection)

  const loadProducts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchProducts({
        page,
        limit,
        category: filter,
        q: debouncedSearch,
        minPrice: priceFilterActive
          ? debouncedPriceSelection![0]
          : undefined,
        maxPrice: priceFilterActive
          ? debouncedPriceSelection![1]
          : undefined,
      })
      setProducts(result.data)
      setCategories(result.categories)
      if (result.priceRange) {
        setPriceBounds(result.priceRange)
        setPriceSelection((prev) => {
          if (prev) return prev
          return [result.priceRange!.min, result.priceRange!.max]
        })
      }
      setTotalPages(result.pagination.totalPages)
      setTotal(result.pagination.total)
      setHasNextPage(result.pagination.hasNextPage)
      setHasPrevPage(result.pagination.hasPrevPage)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products')
      setProducts([])
    } finally {
      setLoading(false)
    }
  }, [
    page,
    limit,
    filter,
    debouncedSearch,
    debouncedPriceSelection,
    priceFilterActive,
  ])

  useEffect(() => {
    void loadProducts()
  }, [loadProducts])

  function changeCategory(cat: string) {
    setFilter(cat)
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
    setFilter('all')
    setSearch('')
    if (priceBounds) {
      setPriceSelection([priceBounds.min, priceBounds.max])
    }
    setPage(1)
  }

  const hasSearch = search.trim().length > 0

  const priceKey = priceFilterActive
    ? `${debouncedPriceSelection![0]}-${debouncedPriceSelection![1]}`
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
          category={filter}
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
              {error}
            </p>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              Loading products…
            </div>
          ) : (
            <>
              <div
                className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4"
                key={`${filter}-${page}-${limit}-${debouncedSearch}-${priceKey}`}
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
