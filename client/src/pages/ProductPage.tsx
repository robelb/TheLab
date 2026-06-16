import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import { useProduct } from '@/hooks/use-product'
import { useRelatedProducts } from '@/hooks/use-related-products'
import { getProductDisplayImage } from '@/lib/productImage'
import { AddToCartButton } from '@/components/AddToCartButton'
import { ProductCard } from '@/components/ProductCard'
import { ProductCardSkeleton } from '@/components/ProductCardSkeleton'
import { ProductDetailSkeleton } from '@/components/ProductDetailSkeleton'
import { formatPrice } from '@/utils/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft } from 'lucide-react'

export function ProductPage() {
  const { session } = useAuth()
  const { id } = useParams<{ id: string }>()
  const domain = session?.domain ?? undefined

  const { data: product, isLoading, error } = useProduct(id, domain)
  const { data: related, isLoading: relatedLoading } = useRelatedProducts(
    id,
    4,
    domain,
  )
  const [activeIndex, setActiveIndex] = useState(0)

  if (isLoading) {
    return <ProductDetailSkeleton />
  }

  if (!product || error) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold">
          {error instanceof Error ? error.message : 'Product not found'}
        </h1>
        <Button asChild variant="outline">
          <Link to="/">Back to shop</Link>
        </Button>
      </div>
    )
  }

  const coverImage = getProductDisplayImage(
    product,
    session?.customizationGeneration != null
      ? String(session.customizationGeneration)
      : session?.loggedInAt,
  )

  // Gallery: the customized/cover image first, then any additional images.
  const gallery =
    product.images && product.images.length > 0
      ? product.images
      : [product.image]
  // Index 0 keeps the customization overlay; other slots show raw images.
  const safeIndex = Math.min(activeIndex, gallery.length - 1)
  const activeImage = safeIndex === 0 ? coverImage : gallery[safeIndex]

  return (
    <article className="space-y-12">
      <Button asChild variant="ghost" size="sm" className="-ml-2 gap-2">
        <Link to="/">
          <ArrowLeft className="size-4" />
          Back to shop
        </Link>
      </Button>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="space-y-3">
          <div className="relative aspect-4/5 overflow-hidden rounded-brand bg-muted/10 shadow-brand lg:aspect-square">
            <img
              src={activeImage}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full scale-105 object-cover blur-sm"
            />
            <img
              src={activeImage}
              alt={product.name}
              className="relative z-10 h-full w-full object-contain"
            />
          </div>

          {gallery.length > 1 && (
            <div className="grid grid-cols-5 gap-2">
              {gallery.map((src, i) => (
                <button
                  key={`${src}-${i}`}
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  aria-label={`View image ${i + 1}`}
                  className={cn(
                    'relative aspect-square overflow-hidden rounded-brand border bg-muted/10 transition-colors',
                    i === safeIndex
                      ? 'border-primary ring-1 ring-primary'
                      : 'border-border/40 hover:border-primary/50',
                  )}
                >
                  <img
                    src={i === 0 ? coverImage : src}
                    alt=""
                    className="h-full w-full object-contain p-1"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <Badge variant="secondary" className="w-fit capitalize">
            {product.category}
          </Badge>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">
            {product.name}
          </h1>
          <p className="text-lg text-muted-foreground">{product.tagline}</p>
          <p className="text-2xl font-bold text-primary">
            {formatPrice(product.price, product.currency)}
          </p>
          {product.stock !== undefined && (
            <p className="text-sm text-muted-foreground">
              {product.stock > 0
                ? `${product.stock} in stock`
                : 'Out of stock'}
            </p>
          )}
          <p className="leading-relaxed text-muted-foreground">
            {product.description}
          </p>

          <AddToCartButton product={product} disabled={product.stock === 0} />

          <Separator />

          <Card className="border-border/30 bg-card/50">
            <CardContent className="space-y-2 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide">
                Details
              </h2>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {product.details.map((d) => (
                  <li key={d}>— {d}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      <section className="space-y-6">
        <Separator />
        <h2 className="font-display text-xl font-semibold tracking-tight">
          You might also like
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          {relatedLoading
            ? Array.from({ length: 4 }, (_, i) => (
                <ProductCardSkeleton key={i} />
              ))
            : related?.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
        </div>
      </section>
    </article>
  )
}
