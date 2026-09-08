import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { cn } from '@/lib/utils'
import { useProduct } from '@/hooks/use-product'
import { useRelatedProducts } from '@/hooks/use-related-products'
import { getProductDisplayImage } from '@/lib/productImage'
import { readProductDesign, writeProductDesign } from '@/lib/productDesign'
import { AddToCartButton } from '@/components/AddToCartButton'
import { ProductCard } from '@/components/ProductCard'
import { ProductCardSkeleton } from '@/components/ProductCardSkeleton'
import { ProductDetailSkeleton } from '@/components/ProductDetailSkeleton'
import { formatPrice } from '@/utils/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Sparkles, Trash2 } from 'lucide-react'

export function ProductPage() {
  const { brandGeneration } = useAuth()
  const { setItemDesign } = useCart()
  const { id } = useParams<{ id: string }>()

  const { data: product, isLoading, error } = useProduct(id)
  const { data: related, isLoading: relatedLoading } = useRelatedProducts(id, 4)
  const [activeIndex, setActiveIndex] = useState(0)
  /**
   * The design this shopper made for this product, if any.
   *
   * Read once on mount rather than watched: the only thing that writes it is
   * the editor, which is a route away, so coming back here remounts the page
   * and re-reads it. Held in state purely so removing one updates the screen.
   */
  const [design, setDesign] = useState(() => readProductDesign(id ?? ''))

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

  const coverImage = getProductDisplayImage(product, brandGeneration)
  /** The exact print artwork stands in for the design — see `ProductDesign`. */
  const designImage = design ? (design.flat ?? design.image) : null

  const catalogue =
    product.images && product.images.length > 0
      ? product.images
      : [product.image]

  /**
   * What there is to look at, this shopper's own design first.
   *
   * It leads because it is the version of the product they will actually
   * receive; everything after it is the catalogue's own set, which is the same
   * picture for everybody. Index 0 of that set keeps the company's branding
   * overlay, which is why the source is not simply `product.images`.
   */
  const slots: { src: string; own: boolean }[] = [
    ...(designImage ? [{ src: designImage, own: true }] : []),
    ...catalogue.map((src, i) => ({
      src: i === 0 ? coverImage : src,
      own: false,
    })),
  ]
  const safeIndex = Math.min(activeIndex, slots.length - 1)
  const activeImage = slots[safeIndex].src

  const designUrl = `/design/${encodeURIComponent(product.id)}?to=product&return=${encodeURIComponent(
    `/product/${product.id}`,
  )}`

  /**
   * Throw the design away, here and in the basket.
   *
   * Both, because there is only one design per product and this button reads
   * as removing it — leaving a copy behind in the cart would send artwork the
   * shopper had just deleted.
   */
  const removeDesign = () => {
    writeProductDesign(product.id, null)
    setItemDesign(product.id, null)
    setDesign(null)
    setActiveIndex(0)
  }

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

          {slots.length > 1 && (
            <div className="grid grid-cols-5 gap-2">
              {slots.map((slot, i) => (
                <button
                  key={`${slot.src}-${i}`}
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  aria-label={
                    slot.own ? 'View your design' : `View image ${i + 1}`
                  }
                  className={cn(
                    'relative aspect-square overflow-hidden rounded-brand border bg-muted/10 transition-colors',
                    i === safeIndex
                      ? 'border-primary ring-1 ring-primary'
                      : 'border-border/40 hover:border-primary/50',
                  )}
                >
                  <img
                    src={slot.src}
                    alt=""
                    className="h-full w-full object-contain p-1"
                  />
                  {/* Say which one is theirs. Without it the design is just an
                      extra photo, indistinguishable from the catalogue's. */}
                  {slot.own && (
                    <span className="absolute inset-x-0 bottom-0 bg-primary/85 py-0.5 text-center text-[9px] font-medium uppercase tracking-wide text-primary-foreground">
                      Yours
                    </span>
                  )}
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

          <div className="flex flex-wrap items-center gap-2">
            <AddToCartButton product={product} disabled={product.stock === 0} />
            {/* The editor was only reachable from the box builder, so someone
                looking at a single product had no way to put their logo on it
                without first starting a box they may not want. */}
            <Button asChild variant={design ? 'ghost' : 'outline'}>
              <Link to={designUrl}>
                <Sparkles className="size-4" />
                {design ? 'Edit your design' : 'Add your branding'}
              </Link>
            </Button>
            {design && (
              <Button
                type="button"
                variant="ghost"
                className="text-muted-foreground"
                onClick={removeDesign}
              >
                <Trash2 className="size-4" />
                Remove design
              </Button>
            )}
          </div>

          {/* The design is not a preview — it is what the basket will carry, so
              say so where the decision is made rather than at checkout. */}
          {design && (
            <p className="rounded-brand border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              Your design is ready. Adding this to the basket sends it with your
              artwork
              {design.prompt ? ` and your brief “${design.prompt}”` : ''}.
            </p>
          )}

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
