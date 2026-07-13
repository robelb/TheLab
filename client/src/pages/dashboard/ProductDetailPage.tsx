import { ArrowLeft, Check, Pencil, Share2, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { createShare, shareUrl, type ShareBrand } from '@/api/share'
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
import { useAuth } from '@/context/AuthContext'
import { useBrand } from '@/context/BrandContext'
import { useProduct } from '@/hooks/use-product'
import {
  useDeleteShare,
  useProductShares,
  useSaveShare,
} from '@/hooks/use-product-shares'
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
  const { brand } = useBrand()
  const { session } = useAuth()
  const designsQuery = useProductShares(id ?? '')
  const saveShareMut = useSaveShare(id ?? '')
  const deleteShareMut = useDeleteShare(id ?? '')
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [sharingSrc, setSharingSrc] = useState<string | null>(null)

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

  const galleryImages =
    product.images && product.images.length > 0
      ? product.images
      : [product.image]
  const designs = designsQuery.data ?? []
  const gallerySet = new Set(galleryImages)
  // Map each design's image → its slug so approved (in-shop) images can also be
  // shared/removed by their design record.
  const slugByImage = new Map(designs.map((d) => [d.imageUrl, d.slug]))
  // "Not approved" = generated designs not yet added to the shop gallery.
  const notApproved = designs.filter((d) => !gallerySet.has(d.imageUrl))

  const imageRows = [
    ...galleryImages.map((src, i) => ({
      key: `a-${src}-${i}`,
      src,
      approved: true,
      cover: i === 0,
      slug: slugByImage.get(src),
    })),
    ...notApproved.map((d) => ({
      key: `n-${d.slug}`,
      src: d.imageUrl,
      approved: false,
      cover: false,
      slug: d.slug as string | undefined,
    })),
  ]

  /** Brand snapshot so the public viewer renders our logo/colors, no session. */
  const brandSnapshot = (): ShareBrand => ({
    companyName: brand.companyName,
    logo: brand.logo && brand.logo.length < 180_000 ? brand.logo : null,
    logoType: brand.logoType ?? null,
    primaryColor: brand.primaryColor,
  })

  /** Create (or reuse) a public share link for an image and copy it. */
  const shareImage = async (src: string) => {
    setSharingSrc(src)
    try {
      const { slug } = await createShare({
        imageUrl: src,
        productId: product.id,
        domain: session?.domain ?? undefined,
        title: product.name,
        brand: brandSnapshot(),
      })
      await navigator.clipboard?.writeText(shareUrl(slug))
      setCopied(src)
      setTimeout(() => setCopied((c) => (c === src ? null : c)), 2000)
    } catch {
      /* clipboard/network failure — leave the row unchanged */
    } finally {
      setSharingSrc(null)
    }
  }

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
                Images ({galleryImages.length}
                {notApproved.length > 0 && (
                  <span className="font-normal text-muted-foreground">
                    {` + ${notApproved.length} pending`}
                  </span>
                )}
                )
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Preview</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {imageRows.map((row) => {
                    const isCopied = copied === row.src
                    const isSharing = sharingSrc === row.src
                    const isApproving =
                      saveShareMut.isPending &&
                      saveShareMut.variables === row.slug
                    const isRejecting =
                      deleteShareMut.isPending &&
                      deleteShareMut.variables === row.slug
                    return (
                      <TableRow key={row.key}>
                        <TableCell>
                          <a
                            href={row.src}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Open full-size image in a new tab"
                          >
                            <img
                              src={row.src}
                              alt=""
                              className="size-12 rounded-brand border border-border/40 object-cover"
                            />
                          </a>
                        </TableCell>
                        <TableCell>
                          {row.approved ? (
                            row.cover ? (
                              <Badge className="gap-1 text-[10px]">
                                <Star className="size-2.5" />
                                Cover
                              </Badge>
                            ) : (
                              <Badge
                                variant="secondary"
                                className="text-[10px]"
                              >
                                In shop
                              </Badge>
                            )
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-amber-400/50 text-[10px] text-amber-600 dark:text-amber-400"
                            >
                              Not approved
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1.5">
                            {!row.approved && row.slug && (
                              <Button
                                size="sm"
                                disabled={isApproving}
                                onClick={() => saveShareMut.mutate(row.slug!)}
                              >
                                <Check className="size-4" />
                                {isApproving ? 'Approving…' : 'Approve'}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isSharing}
                              onClick={() => shareImage(row.src)}
                              title="Copy a public link to share this image for sign-off"
                            >
                              {isCopied ? (
                                <>
                                  <Check className="size-4" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Share2 className="size-4" />
                                  {isSharing ? 'Sharing…' : 'Share'}
                                </>
                              )}
                            </Button>
                            {row.slug && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8 text-muted-foreground hover:text-destructive"
                                disabled={isRejecting}
                                aria-label={
                                  row.approved
                                    ? 'Remove image from shop'
                                    : 'Reject design'
                                }
                                title={
                                  row.approved
                                    ? 'Remove this image from the shop and delete the design'
                                    : 'Reject and delete this design'
                                }
                                onClick={() => deleteShareMut.mutate(row.slug!)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Right: AI photoshoot */}
        <Card className="lg:sticky lg:top-24 h-fit">
          <CardHeader>
            <CardTitle className="text-base">AI photoshoot</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col">
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
