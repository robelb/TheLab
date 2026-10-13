import { Loader2, Search, Star, StarOff } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router-dom'
import { ProductImage } from '@/components/ProductImage'
import { CategoryFilter } from '@/components/dashboard/CategoryFilter'
import { FeaturedBulkActions } from '@/components/dashboard/FeaturedBulkActions'
import { TablePagination } from '@/components/dashboard/TablePagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/context/AuthContext'
import { useDebounce } from '@/hooks/use-debounce'
import { useSetProductsFeatured } from '@/hooks/use-product-mutations'
import { useProducts } from '@/hooks/use-products'
import { useRowSelection } from '@/hooks/use-row-selection'
import { notifyError, notifySaved } from '@/lib/notify'
import { formatPrice } from '@/utils/format'
import { PAGE_SIZE_OPTIONS, type PageSize } from '@/types/product'
import type { Product } from '@/types/product'

type View = 'featured' | 'not-featured'

/**
 * Which products are featured. Featured products are pinned first in every
 * company's shop and are the ones branded with a company's logo when it
 * onboards. Open to any admin — super admin or company admin.
 *
 * Two views — what is featured now, and everything else to pick from — each
 * with checkboxes for bulk changes and a one-click toggle per row.
 */
export function FeaturedProductsPage() {
  const { t } = useTranslation()
  const { can } = useAuth()
  const [view, setView] = useState<View>('featured')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState<PageSize>(20)
  const [search, setSearch] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const debouncedSearch = useDebounce(search, 500)

  const { data, isLoading, isFetching, error } = useProducts({
    page,
    limit,
    q: debouncedSearch,
    categories,
    includeSupplies: true,
    featured: view === 'featured',
  })
  const toggleOne = useSetProductsFeatured()

  const products = data?.data ?? []
  const pagination = data?.pagination
  const selection = useRowSelection('featured', products.map((p) => p.id))
  const showSkeleton = isLoading || isFetching
  const skeletonRows = Math.min(Math.max(products.length || 6, 4), limit)

  // Featured orders every company's shop: a catalogue decision, BLT's own.
  if (!can('manage_all')) return <Navigate to="/dashboard" replace />

  function switchView(next: View) {
    setView(next)
    setPage(1)
    selection.clear()
  }

  async function toggle(product: Product) {
    const isFeatured = !product.isFeatured
    try {
      await toggleOne.mutateAsync({ ids: [product.id], isFeatured })
      notifySaved(
        isFeatured
          ? t('dashboard.admin.featured.featuredToast', { name: product.name })
          : t('dashboard.admin.featured.unfeaturedToast', { name: product.name }),
      )
    } catch (err) {
      notifyError(
        err,
        isFeatured
          ? t('dashboard.admin.featured.featureFailed', { name: product.name })
          : t('dashboard.admin.featured.unfeatureFailed', { name: product.name }),
      )
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold">
          {t('dashboard.admin.featured.title')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('dashboard.admin.featured.subtitle')}
        </p>
      </header>

      <Tabs value={view} onValueChange={(v) => switchView(v as View)}>
        <TabsList>
          <TabsTrigger value="featured">
            <Star className="size-4" />
            {t('dashboard.admin.featured.tabFeatured')}
          </TabsTrigger>
          <TabsTrigger value="not-featured">
            <StarOff className="size-4" />
            {t('dashboard.admin.featured.tabNotFeatured')}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder={t('dashboard.admin.featured.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <CategoryFilter
          options={data?.categories ?? []}
          selected={categories}
          onChange={(next) => {
            setCategories(next)
            setPage(1)
          }}
        />
        <FeaturedBulkActions
          selected={selection.selected}
          onDone={selection.clear}
          show={view === 'featured' ? 'unfeature' : 'feature'}
        />
      </div>

      {error && (
        <p className="rounded-brand border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {(error as Error).message}
        </p>
      )}

      <div className="overflow-hidden rounded-brand border border-border/40">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-10">
                <Checkbox
                  checked={selection.pageState}
                  onCheckedChange={selection.togglePage}
                  disabled={showSkeleton || products.length === 0}
                  aria-label={t('dashboard.admin.common.selectAllOnPage')}
                />
              </TableHead>
              <TableHead>{t('dashboard.admin.common.product')}</TableHead>
              <TableHead>{t('dashboard.admin.common.category')}</TableHead>
              <TableHead>{t('dashboard.admin.common.price')}</TableHead>
              <TableHead className="text-right">
                {t('dashboard.admin.featured.action')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {showSkeleton &&
              Array.from({ length: skeletonRows }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  <TableCell>
                    <Skeleton className="size-4" />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-10 shrink-0 rounded-brand" />
                      <div className="space-y-2">
                        <Skeleton className="h-3.5 w-40" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-14" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="ml-auto h-8 w-28 rounded-brand" />
                  </TableCell>
                </TableRow>
              ))}

            {!showSkeleton && products.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-muted-foreground"
                >
                  {debouncedSearch.trim() || categories.length > 0
                    ? t('dashboard.admin.featured.noMatch')
                    : view === 'featured'
                      ? t('dashboard.admin.featured.emptyFeatured')
                      : t('dashboard.admin.featured.allFeatured')}
                </TableCell>
              </TableRow>
            )}

            {!showSkeleton &&
              products.map((p) => {
                const pending =
                  toggleOne.isPending && toggleOne.variables?.ids[0] === p.id
                return (
                  <TableRow
                    key={p.id}
                    data-state={
                      selection.selected.has(p.id) ? 'selected' : undefined
                    }
                  >
                    <TableCell>
                      <Checkbox
                        checked={selection.selected.has(p.id)}
                        onCheckedChange={() => selection.toggle(p.id)}
                        aria-label={t('dashboard.admin.common.selectItem', {
                          name: p.name,
                        })}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <ProductImage
                          src={p.image}
                          alt=""
                          className="size-10 shrink-0 rounded-brand border border-border/40 bg-background object-cover"
                          loading="lazy"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/dashboard/products/${p.id}`}
                              className="truncate font-medium hover:text-primary hover:underline"
                            >
                              {p.name}
                            </Link>
                            {p.isFeatured && (
                              <Badge className="text-[10px]">
                                {t('dashboard.admin.featured.badge')}
                              </Badge>
                            )}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {p.sku}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.category}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatPrice(p.price, p.currency)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant={p.isFeatured ? 'ghost' : 'outline'}
                          disabled={toggleOne.isPending}
                          onClick={() => void toggle(p)}
                        >
                          {pending ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : p.isFeatured ? (
                            <StarOff className="size-4" />
                          ) : (
                            <Star className="size-4" />
                          )}
                          {p.isFeatured
                            ? t('dashboard.admin.featured.unfeature')
                            : t('dashboard.admin.featured.feature')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
          </TableBody>
        </Table>
      </div>

      {pagination && (
        <TablePagination
          pagination={pagination}
          shown={products.length}
          pageSizes={PAGE_SIZE_OPTIONS}
          disabled={isFetching}
          onPageChange={setPage}
          onLimitChange={(next) => {
            setLimit(next as PageSize)
            setPage(1)
          }}
        />
      )}
    </div>
  )
}
