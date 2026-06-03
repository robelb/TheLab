import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useProduct } from '@/hooks/use-product'
import { getProductDisplayImage } from '@/lib/productImage'
import { AddToCartButton } from '@/components/AddToCartButton'
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

  const { data: product, isLoading, error } = useProduct(
    id,
    session?.domain ?? undefined,
  )

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

  const displayImage = getProductDisplayImage(
    product,
    session?.customizationGeneration != null
      ? String(session.customizationGeneration)
      : session?.loggedInAt,
  )

  return (
    <article className="space-y-8">
      <Button asChild variant="ghost" size="sm" className="-ml-2 gap-2">
        <Link to="/">
          <ArrowLeft className="size-4" />
          Back to shop
        </Link>
      </Button>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="relative aspect-4/5 overflow-hidden rounded-brand bg-muted/10 shadow-brand lg:aspect-square">
          <img
            src={displayImage}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full scale-105 object-cover blur-sm"
          />
          <img
            src={displayImage}
            alt={product.name}
            className="relative z-10 h-full w-full object-contain p-4 lg:p-6"
          />
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
    </article>
  )
}
