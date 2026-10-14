import { ArrowLeft, Check, Maximize2, Pencil, Share2, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router-dom'
import { createShare, shareUrl, type ShareBrand } from '@/api/share'
import { ProductFormDialog } from '@/components/dashboard/ProductFormDialog'
import { PhotoshootPanel } from '@/components/dashboard/PhotoshootPanel'
import { ProductLabels } from '@/components/ProductLabels'
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
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const { data: product, isLoading, error } = useProduct(id)
  const { brand } = useBrand()
  const { domain, can } = useAuth()
  const designsQuery = useProductShares(id ?? '')
  const saveShareMut = useSaveShare(id ?? '')
  const deleteShareMut = useDeleteShare(id ?? '')
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [sharingSrc, setSharingSrc] = useState<string | null>(null)

  // The catalogue is big little things' own — see ProductsAdminPage.
  if (!can('manage_all')) return <Navigate to="/dashboard" replace />

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
          {error instanceof Error ? error.message : t('dashboard.products.detail.notFound')}
        </p>
        <Button asChild variant="outline">
          <Link to="/dashboard/products">
            <ArrowLeft className="size-4" />
            {t('dashboard.products.detail.backToProducts')}
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
        domain: domain ?? undefined,
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
          <Button asChild variant="ghost" size="icon" aria-label={t('dashboard.products.detail.back')}>
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
          {t('dashboard.products.detail.editProduct')}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: product data + image table */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t('dashboard.products.detail.details')}
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border/40 py-0">
              <DataRow label={t('dashboard.products.detail.sku')} value={product.sku ?? '—'} />
              <DataRow label={t('dashboard.products.detail.category')} value={product.category} />
              <DataRow
                label={t('dashboard.products.detail.labels')}
                value={
                  product.labels?.length ? (
                    <ProductLabels labels={product.labels} className="justify-end" />
                  ) : (
                    '—'
                  )
                }
              />
              <DataRow
                label={t('dashboard.products.detail.price')}
                value={formatPrice(product.price, product.currency)}
              />
              <DataRow
                label={t('dashboard.products.detail.stock')}
                value={
                  product.stock === 0 ? (
                    <span className="text-destructive">
                      {t('dashboard.products.outOfStock')}
                    </span>
                  ) : (
                    (product.stock ?? '—')
                  )
                }
              />
              <DataRow
                label={t('dashboard.products.detail.featured')}
                value={
                  product.isFeatured ? (
                    <Badge className="gap-1 text-[10px]">
                      <Star className="size-2.5" />
                      {t('dashboard.products.badgeFeatured')}
                    </Badge>
                  ) : (
                    t('dashboard.products.detail.no')
                  )
                }
              />
              {product.description && (
                <div className="space-y-1 py-2 text-sm">
                  <span className="text-muted-foreground">
                    {t('dashboard.products.detail.description')}
                  </span>
                  <p>{product.description}</p>
                </div>
              )}
              {product.details.length > 0 && (
                <div className="space-y-1 py-2 text-sm">
                  <span className="text-muted-foreground">
                    {t('dashboard.products.detail.details')}
                  </span>
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
                {notApproved.length > 0 ? (
                  <Trans
                    i18nKey="dashboard.products.detail.imagesTitleWithPending"
                    values={{ total: galleryImages.length, pending: notApproved.length }}
                    components={{
                      pending: <span className="font-normal text-muted-foreground" />,
                    }}
                  />
                ) : (
                  t('dashboard.products.detail.imagesTitle', {
                    total: galleryImages.length,
                  })
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">
                      {t('dashboard.products.detail.colPreview')}
                    </TableHead>
                    <TableHead className="w-28">
                      {t('dashboard.products.detail.colStatus')}
                    </TableHead>
                    <TableHead className="text-right">
                      {t('dashboard.products.detail.colActions')}
                    </TableHead>
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
                            aria-label={t('dashboard.products.detail.openFullSize')}
                          >
                            <img
                              src={row.src}
                              alt=""
                              className="size-12 rounded-brand border border-border object-cover"
                            />
                          </a>
                        </TableCell>
                        <TableCell>
                          {row.approved ? (
                            row.cover ? (
                              <Badge className="gap-1 text-[10px]">
                                <Star className="size-2.5" />
                                {t('dashboard.products.detail.cover')}
                              </Badge>
                            ) : (
                              <Badge
                                variant="secondary"
                                className="text-[10px]"
                              >
                                {t('dashboard.products.detail.inShop')}
                              </Badge>
                            )
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-amber-400/50 text-[10px] text-amber-600 dark:text-amber-400"
                            >
                              {t('dashboard.products.detail.notApproved')}
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
                                {isApproving
                                  ? t('dashboard.products.detail.approving')
                                  : t('dashboard.products.detail.approve')}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isSharing}
                              onClick={() => shareImage(row.src)}
                              title={t('dashboard.products.detail.shareTitle')}
                            >
                              {isCopied ? (
                                <>
                                  <Check className="size-4" />
                                  {t('dashboard.products.copied')}
                                </>
                              ) : (
                                <>
                                  <Share2 className="size-4" />
                                  {isSharing
                                    ? t('dashboard.products.sharing')
                                    : t('dashboard.products.share')}
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
                                    ? t('dashboard.products.detail.removeFromShop')
                                    : t('dashboard.products.detail.rejectDesign')
                                }
                                title={
                                  row.approved
                                    ? t('dashboard.products.detail.removeFromShopTitle')
                                    : t('dashboard.products.detail.rejectDesignTitle')
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
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">
              {t('dashboard.products.detail.photoshoot')}
            </CardTitle>
            {/* The panel can place branding inline, but the editor has room to
                work in — same canvas, same result, more space. */}
            <Button asChild size="sm" variant="outline">
              <Link
                to={`/design/${encodeURIComponent(product.id)}?to=catalogue&return=${encodeURIComponent(
                  `/dashboard/products/${product.id}`,
                )}`}
              >
                <Maximize2 className="size-3.5" />
                {t('dashboard.products.detail.openDesignEditor')}
              </Link>
            </Button>
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
