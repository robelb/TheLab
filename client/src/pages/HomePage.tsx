import { useState } from 'react'
import { useBrand } from '@/context/BrandContext'
import { useDebounce } from '@/hooks/use-debounce'
import { useIsMobile } from '@/hooks/use-mobile'
import { useImageSearch, useProducts } from '@/hooks/use-products'
import { isPriceRangeFiltered } from '@/components/PriceRangeFilter'
import { CampaignVideoAd } from '@/components/CampaignVideoAd'
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

/** Coerce a brand color to `#rrggbb`, falling back to a sensible default. */
function toHexColor(value: string | null | undefined): string {
  const v = value?.trim() ?? ''
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase()
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v.toLowerCase()}`
  return '#2563eb'
}

function extractErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: { error?: string } } }).response
      ?.data
    if (data?.error) return data.error
  }
  return err instanceof Error ? err.message : 'Image search failed'
}

export function HomePage() {
  const { brand } = useBrand()
  const isMobile = useIsMobile()

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
  // Brand-color similarity sort — on by default, seeded from the brand's color.
  const [colorSort, setColorSort] = useState(true)
  const [brandColor, setBrandColor] = useState(() =>
    toHexColor(brand.primaryColor),
  )

  const imageSearch = useImageSearch()
  const imageActive = imagePreview !== null

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
    brandColor: colorSort ? brandColor : undefined,
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

  function changeBrandColor(hex: string) {
    setBrandColor(hex)
    setPage(1)
  }

  function toggleColorSort(active: boolean) {
    setColorSort(active)
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

  // The price bound the server extracted from a typed phrase. Reflected as a
  // chip so the shopper can see and clear what was applied.
  const interpreted = imageActive ? undefined : data?.interpretedQuery
  const interpretedChips: string[] = []
  if (interpreted) {
    const { minPrice, maxPrice } = interpreted
    if (minPrice !== undefined && maxPrice !== undefined) {
      interpretedChips.push(`€${minPrice} – €${maxPrice}`)
    } else if (maxPrice !== undefined) {
      interpretedChips.push(`≤ €${maxPrice}`)
    } else if (minPrice !== undefined) {
      interpretedChips.push(`≥ €${minPrice}`)
    }
  }

  // Browse context feeds relevance ranking of the video ads.
  const adCategory = category !== 'all' ? category : undefined
  const adQuery = debouncedSearch || undefined

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

      {/* Mobile hero ad — landscape videos only (see CampaignVideoAd). */}
      {isMobile && (
        <CampaignVideoAd slot="hero" category={adCategory} q={adQuery} />
      )}

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

      {!imageActive && interpretedChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-brand border border-border/50 bg-card/40 px-4 py-2 text-sm">
          <span className="text-muted-foreground">Understood as:</span>
          {interpretedChips.map((chip) => (
            <span
              key={chip}
              className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
            >
              {chip}
            </span>
          ))}
          {interpreted?.cleaned && (
            <span className="text-xs text-muted-foreground">
              searching “{interpreted.cleaned}”
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7"
            onClick={() => changeSearch('')}
          >
            Clear
          </Button>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,15.5rem)_1fr] lg:items-start">
        <div className="space-y-6">
          {/* Desktop side-rail ad — portrait videos only (see CampaignVideoAd). */}
          {!isMobile && (
            <CampaignVideoAd slot="side" category={adCategory} q={adQuery} />
          )}
          <ProductFilters
            categories={categories}
            category={category}
            onCategoryChange={changeCategory}
            priceBounds={priceBounds}
            priceSelection={priceSelection}
            onPriceChange={changePrice}
            brandColor={brandColor}
            colorSortActive={colorSort}
            onBrandColorChange={changeBrandColor}
            onColorSortToggle={toggleColorSort}
            total={total}
            showing={products.length}
            loading={loading}
            hasSearch={hasSearch}
            onClearAll={clearAllFilters}
            className="lg:sticky lg:top-20"
          />
        </div>

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

          {loading ? (
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
