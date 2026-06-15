import { ArrowLeft, Pencil, Star } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ProductFormDialog } from '@/components/dashboard/ProductFormDialog'
import { PhotoshootPanel } from '@/components/dashboard/PhotoshootPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useProduct } from '@/hooks/use-product'
import { formatPrice } from '@/utils/format'

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: product, isLoading, error } = useProduct(id)
  const [editing, setEditing] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96 rounded-brand" />
          <Skeleton className="h-96 rounded-brand" />
        </div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="space-y-4">
        <p className="rounded-brand border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Product not found'}
        </p>
        <Button asChild variant="outline">
          <Link to="/dashboard/products">
            <ArrowLeft className="size-4" />
            Back to products
          </Link>
        </Button>
      </div>
    )
  }

  const gallery =
    product.images && product.images.length > 0
      ? product.images
      : [product.image]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <Link to="/dashboard/products">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="font-display text-2xl font-bold">{product.name}</h1>
            <p className="text-sm text-muted-foreground">{product.tagline}</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setEditing(true)}>
          <Pencil className="size-4" />
          Edit product
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: product data + image table */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border/40 py-0">
              <DataRow label="SKU" value={product.sku ?? '—'} />
              <DataRow label="Category" value={product.category} />
              <DataRow
                label="Price"
                value={formatPrice(product.price, product.currency)}
              />
              <DataRow
                label="Stock"
                value={
                  product.stock === 0 ? (
                    <span className="text-destructive">Out of stock</span>
                  ) : (
                    (product.stock ?? '—')
                  )
                }
              />
              <DataRow
                label="Featured"
                value={
                  product.isFeatured ? (
                    <Badge className="gap-1 text-[10px]">
                      <Star className="size-2.5" />
                      Featured
                    </Badge>
                  ) : (
                    'No'
                  )
                }
              />
              {product.description && (
                <div className="space-y-1 py-2 text-sm">
                  <span className="text-muted-foreground">Description</span>
                  <p>{product.description}</p>
                </div>
              )}
              {product.details.length > 0 && (
                <div className="space-y-1 py-2 text-sm">
                  <span className="text-muted-foreground">Details</span>
                  <ul className="list-inside list-disc text-muted-foreground">
                    {product.details.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Images ({gallery.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">#</TableHead>
                    <TableHead className="w-20">Preview</TableHead>
                    <TableHead>URL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gallery.map((src, i) => (
                    <TableRow key={`${src}-${i}`}>
                      <TableCell>
                        {i === 0 ? (
                          <Badge className="gap-1 text-[10px]">
                            <Star className="size-2.5" />
                            Cover
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">{i + 1}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <img
                          src={src}
                          alt=""
                          className="size-12 rounded-brand border border-border/40 object-cover"
                        />
                      </TableCell>
                      <TableCell className="max-w-0">
                        <a
                          href={src}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-xs text-primary hover:underline"
                        >
                          {src}
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Right: AI photoshoot */}
        <Card className="lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)]">
          <CardHeader>
            <CardTitle className="text-base">AI photoshoot</CardTitle>
          </CardHeader>
          <CardContent className="flex h-[calc(100%-4.5rem)] flex-col">
            <PhotoshootPanel product={product} />
          </CardContent>
        </Card>
      </div>

      <ProductFormDialog
        product={editing ? product : null}
        open={editing}
        onClose={() => setEditing(false)}
      />
    </div>
  )
}
