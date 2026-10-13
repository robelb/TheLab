import { Eye, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router-dom'
import { CategoryFilter } from '@/components/dashboard/CategoryFilter'
import { FeaturedBulkActions } from '@/components/dashboard/FeaturedBulkActions'
import { ProductFormDialog } from '@/components/dashboard/ProductFormDialog'
import { TablePagination } from '@/components/dashboard/TablePagination'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import { useAuth } from '@/context/AuthContext'
import { useDebounce } from '@/hooks/use-debounce'
import { useDeleteProduct } from '@/hooks/use-product-mutations'
import { notifyError, notifySaved } from '@/lib/notify'
import { useProducts } from '@/hooks/use-products'
import { useRowSelection } from '@/hooks/use-row-selection'
import { isSupplyCategory } from '@/lib/box'
import { PAGE_SIZE_OPTIONS, type PageSize } from '@/types/product'
import type { Product } from '@/types/product'
import { formatPrice } from '@/utils/format'

export function ProductsAdminPage() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState<PageSize>(20)
  const [search, setSearch] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const debouncedSearch = useDebounce(search, 500)

  const [editing, setEditing] = useState<Product | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null)

  // Packaging and filling material are hidden from the shop but managed here,
  // so the dashboard table asks for them explicitly.
  const { data, isLoading, error, isFetching } = useProducts({
    page,
    limit,
    q: debouncedSearch,
    categories,
    includeSupplies: true,
  })
  const deleteMutation = useDeleteProduct()
  // The catalogue is big little things' own: only its admins manage it, here
  // and on the server. Featured is global too — it orders every company's shop.
  const { can } = useAuth()
  const canFeature = can('manage_all')

  const products = data?.data ?? []
  const selection = useRowSelection('products', products.map((p) => p.id))
  const columnCount = canFeature ? 6 : 5
  const pagination = data?.pagination
  // Skeleton on the first load *and* on every refetch (page/size/search change),
  // since keepPreviousData means isLoading is only true on the very first fetch.
  const showSkeleton = isLoading || isFetching
  const skeletonRows = Math.min(Math.max(products.length || 8, 4), limit)

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (product: Product) => {
    setEditing(product)
    setDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const { name } = pendingDelete
    try {
      await deleteMutation.mutateAsync(pendingDelete.id)
      setPendingDelete(null)
      notifySaved(t('dashboard.products.list.deletedToast', { name }))
    } catch (err) {
      // A product inside a pre-configured box cannot be deleted, and the
      // server says so — which was previously swallowed into an unhandled
      // rejection and looked like nothing happening.
      notifyError(err, t('dashboard.products.list.deleteFailed', { name }))
    }
  }

  if (!can('manage_all')) return <Navigate to="/dashboard" replace />

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold">{t('dashboard.products.list.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {pagination
              ? t('dashboard.products.list.count', { count: pagination.total })
              : t('dashboard.products.list.subtitle')}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          {t('dashboard.products.list.newProduct')}
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder={t('dashboard.products.list.searchPlaceholder')}
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
        {canFeature && (
          <FeaturedBulkActions
            selected={selection.selected}
            onDone={selection.clear}
          />
        )}
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
              {canFeature && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={selection.pageState}
                    onCheckedChange={selection.togglePage}
                    disabled={showSkeleton || products.length === 0}
                    aria-label={t('dashboard.products.list.selectPage')}
                  />
                </TableHead>
              )}
              <TableHead>{t('dashboard.products.list.colProduct')}</TableHead>
              <TableHead>{t('dashboard.products.list.colCategory')}</TableHead>
              <TableHead>{t('dashboard.products.list.colPrice')}</TableHead>
              <TableHead>{t('dashboard.products.list.colStock')}</TableHead>
              <TableHead className="text-right">
                {t('dashboard.products.list.colActions')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {showSkeleton &&
              Array.from({ length: skeletonRows }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {canFeature && (
                    <TableCell>
                      <Skeleton className="size-4" />
                    </TableCell>
                  )}
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
                    <Skeleton className="h-4 w-10" />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Skeleton className="size-8 rounded-brand" />
                      <Skeleton className="size-8 rounded-brand" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}

            {!showSkeleton && products.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={columnCount}
                  className="py-10 text-center text-muted-foreground"
                >
                  {t('dashboard.products.list.empty')}
                </TableCell>
              </TableRow>
            )}

            {!showSkeleton &&
              products.map((p) => (
              <TableRow
                key={p.id}
                data-state={selection.selected.has(p.id) ? 'selected' : undefined}
              >
                {canFeature && (
                  <TableCell>
                    <Checkbox
                      checked={selection.selected.has(p.id)}
                      onCheckedChange={() => selection.toggle(p.id)}
                      aria-label={t('dashboard.products.list.selectRow', { name: p.name })}
                    />
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex items-center gap-3">
                    <img
                      src={p.image}
                      alt=""
                      className="size-10 shrink-0 rounded-brand border border-border/40 object-cover"
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
                            {t('dashboard.products.badgeFeatured')}
                          </Badge>
                        )}
                        {p.active === false && (
                          <Badge variant="outline" className="border-destructive/40 text-[10px] text-destructive">
                            {t('dashboard.products.list.badgeNotForSale')}
                          </Badge>
                        )}
                        {/* These never reach the shop — they're only offered
                            when a shopper builds a box. */}
                        {isSupplyCategory(p.categorySlug) && (
                          <Badge variant="outline" className="text-[10px]">
                            {t('dashboard.products.list.badgeSupply')}
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
                <TableCell>{formatPrice(p.price, p.currency)}</TableCell>
                <TableCell>
                  {p.stock === 0 ? (
                    <span className="text-destructive">
                      {t('dashboard.products.outOfStock')}
                    </span>
                  ) : (
                    <span>{p.stock}</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      aria-label={t('dashboard.products.list.openRow', { name: p.name })}
                    >
                      <Link to={`/dashboard/products/${p.id}`}>
                        <Eye className="size-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(p)}
                      aria-label={t('dashboard.products.list.editRow', { name: p.name })}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setPendingDelete(p)}
                      aria-label={t('dashboard.products.list.deleteRow', { name: p.name })}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
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

      <ProductFormDialog
        product={editing}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => !next && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('dashboard.products.list.deleteTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Trans
                i18nKey="dashboard.products.list.deleteDescription"
                values={{ name: pendingDelete?.name ?? '' }}
                components={{
                  name: <span className="font-medium text-foreground" />,
                }}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t('dashboard.products.list.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              {deleteMutation.isPending
                ? t('dashboard.products.list.deleting')
                : t('dashboard.products.list.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
