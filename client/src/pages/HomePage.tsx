import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useBrand } from '@/context/BrandContext'
import { useDebounce } from '@/hooks/use-debounce'
import { useImageSearch, useProducts } from '@/hooks/use-products'
import { isPriceRangeFiltered } from '@/components/PriceRangeFilter'
import { ImageSearch } from '@/components/ImageSearch'
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

function extractErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: { error?: string } } }).response
      ?.data
    if (data?.error) return data.error
  }
  return err instanceof Error ? err.message : 'Image search failed'
}

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
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)

  const imageSearch = useImageSearch()
  const imageActive = imagePreview !== null

  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS)
  const debouncedPrice = useDebounce(priceSelection, PRICE_DEBOUNCE_MS)

  const priceFilterActive =
    priceBounds &&
    debouncedPrice &&
    isPriceRangeFiltered(priceBounds, debouncedPrice)

  const { data, isLoading, isFetching, isPlaceholderData, error } = useProducts({
    page,
    limit,
    category: category !== 'all' ? category : undefined,
    q: debouncedSearch || undefined,
    minPrice: priceFilterActive ? debouncedPrice![0] : undefined,
    maxPrice: priceFilterActive ? debouncedPrice![1] : undefined,
    domain: session?.domain ?? undefined,
  })

  const categories = data?.categories ?? []
  const products = imageActive
    ? (imageSearch.data?.data ?? [])
    : (data?.data ?? [])
  const pagination = data?.pagination
  // Image search returns a single ranked page — hide pagination while it's active.
  const total = imageActive
    ? (imageSearch.data?.data.length ?? 0)
    : (pagination?.total ?? 0)
  const totalPages = imageActive ? 0 : (pagination?.totalPages ?? 0)
  const hasNextPage = imageActive ? false : (pagination?.hasNextPage ?? false)
  const hasPrevPage = imageActive ? false : (pagination?.hasPrevPage ?? false)

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

  function runImageSearch(dataUrl: string) {
    setImageError(null)
    setImagePreview(dataUrl)
    setPage(1)
    imageSearch.mutate({
      image: dataUrl,
      category: category !== 'all' ? category : undefined,
      minPrice: priceFilterActive ? debouncedPrice![0] : undefined,
      maxPrice: priceFilterActive ? debouncedPrice![1] : undefined,
      domain: session?.domain ?? undefined,
    })
  }

  function clearImageSearch() {
    setImagePreview(null)
    setImageError(null)
    imageSearch.reset()
  }

  function clearAllFilters() {
    setCategory('all')
    setSearch('')
    clearImageSearch()
    if (priceBounds) {
      setPriceSelection([priceBounds.min, priceBounds.max])
    }
    setPage(1)
  }

  const loading = imageActive
    ? imageSearch.isPending
    : isLoading || isFetching
  const hasSearch = search.trim().length > 0
  const imageCaption = imageSearch.data?.caption
  const imageSearchError =
    imageError ??
    (imageSearch.isError
      ? extractErrorMessage(imageSearch.error)
      : null)
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

      <div className="flex flex-col gap-3 min-[280px]:flex-row sm:items-center">
        <ProductSearchBar
          value={search}
          onChange={changeSearch}
          className="flex-1"
        />
        <div className="ml-auto">
        <ImageSearch
          onSearch={runImageSearch}
          onClear={clearImageSearch}
          isSearching={imageSearch.isPending}
          previewUrl={imagePreview}
          onError={setImageError}
        />
        </div>
      </div>

      {imageActive && (
        <div className="flex flex-wrap items-center gap-2 rounded-brand border border-border/50 bg-card/40 px-4 py-2 text-sm">
          <span className="text-muted-foreground">
            {imageCaption
              ? `Visual matches for: “${imageCaption}”`
              : 'Finding visual matches…'}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7"
            onClick={clearImageSearch}
          >
            Clear
          </Button>
        </div>
      )}

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

          {(imageActive ? imageSearchError : error) && (
            <p className="rounded-brand border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {imageActive
                ? imageSearchError
                : error instanceof Error
                  ? error.message
                  : 'Failed to load products'}
            </p>
          )}

          {(imageActive && imageSearch.isPending) ||
          (!imageActive && (isLoading || (isFetching && isPlaceholderData))) ? (
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
