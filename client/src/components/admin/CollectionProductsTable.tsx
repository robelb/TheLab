import { useEffect, useState } from 'react'
import { Loader2, Package, Plus, Search, X } from 'lucide-react'
import { AddProductDialog } from '@/components/AddProductDialog'
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
import { useDebounce } from '@/hooks/use-debounce'
import {
  useCollectionProducts,
  useSetCollectionProducts,
} from '@/hooks/use-collections-admin'
import { notifyError, notifySaved } from '@/lib/notify'
import { formatPrice } from '@/utils/format'
import type { Collection } from '@/api/collections'
import type { Product } from '@/types/product'
import { ProductImage } from '@/components/ProductImage'

/**
 * What a landing page lists under the boxes it leads with — single items and
 * other boxes alike.
 *
 * Paged and searched on the server: a collection filled from an import holds
 * hundreds of these. The boxes shown first carry the tag too, but they have a
 * table of their own above, so this one leaves them out.
 *
 * Changes save on the spot, unlike the boxes' running order, and adding or
 * removing any number of rows is one request.
 */
export function CollectionProductsTable({
  collection,
}: {
  collection: Collection
}) {
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [search, setSearch] = useState('')
  const q = useDebounce(search, 400)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [picking, setPicking] = useState(false)

  const query = useCollectionProducts(collection.id, {
    page,
    limit,
    q,
    excludeFeatured: true,
  })
  const setMembers = useSetCollectionProducts(collection.id)

  const rows = query.data?.data ?? []
  const pagination = query.data?.pagination
  const memberIds = query.data?.ids ?? []
  // The picker hides what is already on the page, headline boxes included —
  // adding one of those here would change nothing.
  const onPageIds = [...memberIds, ...(collection.featuredBundleIds ?? [])]
  const loading = query.isPending || (query.isFetching && query.isPlaceholderData)

  // Removing the last rows of the last page leaves the table on a page that no
  // longer exists; step back to the one that does.
  useEffect(() => {
    if (pagination && pagination.totalPages > 0 && page > pagination.totalPages) {
      setPage(pagination.totalPages)
    }
  }, [pagination, page])

  const pageIds = rows.map((p) => p.id)
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id))
  const someOnPage = pageIds.some((id) => selected.has(id))

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of pageIds) {
        if (allOnPage) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  async function remove(ids: string[], label: string) {
    try {
      await setMembers.mutateAsync({ remove: ids })
      setSelected((prev) => {
        const next = new Set(prev)
        for (const id of ids) next.delete(id)
        return next
      })
      notifySaved(`${label} removed from /c/${collection.slug}`)
    } catch (err) {
      notifyError(err, `Could not remove ${label}`)
    }
  }

  async function add(products: Product[]) {
    const label =
      products.length === 1 ? products[0].name : `${products.length} products`
    try {
      await setMembers.mutateAsync({ add: products.map((p) => p.id) })
      notifySaved(`${label} added to /c/${collection.slug}`)
      setPicking(false)
    } catch (err) {
      notifyError(err, `Could not add ${label}`)
      // Keeps the picker open with the same ticks, to try again.
      throw err
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold">
            Additional products
            {pagination && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {memberIds.length}
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground">
            Listed under the boxes, and what a shopper can put in a box of their
            own. Saved the moment you add or remove one.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={setMembers.isPending}
          onClick={() => setPicking(true)}
        >
          <Plus className="size-4" />
          Add products or boxes
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Search by name or SKU…"
            className="pl-9"
          />
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-2 rounded-brand border border-border/40 bg-muted/30 px-2 py-1">
            <span className="text-sm">{selected.size} selected</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={setMembers.isPending}
              onClick={() =>
                void remove(
                  [...selected],
                  selected.size === 1 ? '1 product' : `${selected.size} products`,
                )
              }
            >
              {setMembers.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <X className="size-4" />
              )}
              Remove selected
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-brand border border-border/40">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-10">
                <Checkbox
                  checked={allOnPage ? true : someOnPage ? 'indeterminate' : false}
                  onCheckedChange={togglePage}
                  disabled={rows.length === 0}
                  aria-label="Select every product on this page"
                />
              </TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Price</TableHead>
              <TableHead className="text-right">Remove</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: Math.min(rows.length || 5, limit) }).map(
                (_, i) => (
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
                      <Skeleton className="ml-auto size-8 rounded-brand" />
                    </TableCell>
                  </TableRow>
                ),
              )}

            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-muted-foreground"
                >
                  {q.trim()
                    ? `Nothing in this collection matches “${q.trim()}”.`
                    : 'No products yet — add the items shoppers should see under the boxes.'}
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              rows.map((product) => (
                <TableRow
                  key={product.id}
                  data-state={selected.has(product.id) ? 'selected' : undefined}
                >
                  <TableCell>
                    <Checkbox
                      checked={selected.has(product.id)}
                      onCheckedChange={() => toggle(product.id)}
                      aria-label={`Select ${product.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <ProductImage
                        src={product.image}
                        alt=""
                        className="size-10 shrink-0 rounded-brand border border-border/40 bg-background object-contain"
                        loading="lazy"
                      />
                      <div className="min-w-0">
                        <p className="flex min-w-0 items-center gap-2 font-medium">
                          <span className="truncate">{product.name}</span>
                          {product.kind === 'bundle' && (
                            <Badge
                              variant="secondary"
                              className="shrink-0 gap-1 px-1.5 py-0 text-[10px]"
                            >
                              <Package className="size-3" />
                              Box
                            </Badge>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {product.sku}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {product.category}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatPrice(product.price, product.currency)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={setMembers.isPending}
                        aria-label={`Remove ${product.name} from this collection`}
                        onClick={() => void remove([product.id], product.name)}
                      >
                        <X className="size-4" />
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
          shown={rows.length}
          disabled={query.isFetching}
          onPageChange={setPage}
          onLimitChange={(next) => {
            setLimit(next)
            setPage(1)
          }}
        />
      )}

      <AddProductDialog
        open={picking}
        onOpenChange={setPicking}
        // Every id already in, not just this page's — the server sends them.
        existingIds={onPageIds}
        onAddMany={add}
        title="Add products or boxes to this collection"
      />
    </section>
  )
}
