import { Eye, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CategoryFilter } from '@/components/dashboard/CategoryFilter'
import { ProductFormDialog } from '@/components/dashboard/ProductFormDialog'
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
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useDebounce } from '@/hooks/use-debounce'
import { useDeleteProduct } from '@/hooks/use-product-mutations'
import { useProducts } from '@/hooks/use-products'
import { PAGE_SIZE_OPTIONS, type PageSize } from '@/types/product'
import type { Product } from '@/types/product'

function formatPrice(value: number, currency = 'EUR') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(value)
}

export function ProductsAdminPage() {
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState<PageSize>(20)
  const [search, setSearch] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const debouncedSearch = useDebounce(search, 500)

  const [editing, setEditing] = useState<Product | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null)

  const { data, isLoading, error, isFetching } = useProducts({
    page,
    limit,
    q: debouncedSearch,
    categories,
  })
  const deleteMutation = useDeleteProduct()

  const products = data?.data ?? []
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
    await deleteMutation.mutateAsync(pendingDelete.id)
    setPendingDelete(null)
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold">Products</h1>
          <p className="text-sm text-muted-foreground">
            {pagination ? `${pagination.total} products` : 'Manage your catalog'}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          New product
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
            placeholder="Search products…"
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
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {showSkeleton &&
              Array.from({ length: skeletonRows }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
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
                  colSpan={5}
                  className="py-10 text-center text-muted-foreground"
                >
                  No products found.
                </TableCell>
              </TableRow>
            )}

            {!showSkeleton &&
              products.map((p) => (
              <TableRow key={p.id}>
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
                          <Badge className="text-[10px]">Featured</Badge>
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
                    <span className="text-destructive">Out of stock</span>
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
                      aria-label={`Open ${p.name}`}
                    >
                      <Link to={`/dashboard/products/${p.id}`}>
                        <Eye className="size-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(p)}
                      aria-label={`Edit ${p.name}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setPendingDelete(p)}
                      aria-label={`Delete ${p.name}`}
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

      {pagination && pagination.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rows per page</span>
              <Select
                value={String(limit)}
                onValueChange={(v) => {
                  setLimit(Number(v) as PageSize)
                  setPage(1)
                }}
              >
                <SelectTrigger size="sm" className="w-[4.5rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">
              Showing{' '}
              <span className="font-medium text-foreground">
                {(pagination.page - 1) * pagination.limit + 1}–
                {(pagination.page - 1) * pagination.limit + products.length}
              </span>{' '}
              of{' '}
              <span className="font-medium text-foreground">
                {pagination.total}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasPrevPage || isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasNextPage || isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
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
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{' '}
              <span className="font-medium text-foreground">
                {pendingDelete?.name}
              </span>
              . This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
