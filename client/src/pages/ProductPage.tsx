import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { usePostHog } from '@posthog/react'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { cn } from '@/lib/utils'
import { useProduct } from '@/hooks/use-product'
import { useRelatedProducts } from '@/hooks/use-related-products'
import { getProductDisplayImage } from '@/lib/productImage'
import { readProductDesign, writeProductDesign } from '@/lib/productDesign'
import { AddToCartButton } from '@/components/AddToCartButton'
import { QuantityStepper } from '@/components/QuantityStepper'
import { ProductCard } from '@/components/ProductCard'
import { ProductCardSkeleton } from '@/components/ProductCardSkeleton'
import { ProductDetailSkeleton } from '@/components/ProductDetailSkeleton'
import { ProductLabels } from '@/components/ProductLabels'
import { formatPrice } from '@/utils/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { GREETING_MAX_LENGTH } from '@/types/box'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Palette,
  Pencil,
  ShoppingBag,
  Trash2,
} from 'lucide-react'
import { bundleToBoxDetails } from '@/lib/box'
import { useFunnel } from '@/context/FunnelContext'
import { ErrorState } from '@/components/ErrorState'
import { pageErrorKind } from '@/lib/errors'

export function ProductPage() {
  const { t } = useTranslation()
  const { brandGeneration } = useAuth()
  const { setItemDesign, addItem } = useCart()
  const { id } = useParams<{ id: string }>()
  // Whether the campaign that sent them here offers customisation. Carried on
  // the link as `?from=<collection>`, so it describes this visit only: a
  // product opened from anywhere else is unaffected.
  const {
    allowCustomization: customizable,
    shopHome,
    inFunnel,
    collectionTag,
    collectionSlug,
  } = useFunnel()
  const posthog = usePostHog()

  const { data: product, isLoading, error, refetch } = useProduct(id)
  // Inside a campaign, only more of that campaign — never the whole catalogue.
  const { data: related, isLoading: relatedLoading } = useRelatedProducts(
    id,
    4,
    inFunnel ? collectionTag : undefined,
  )
  const [activeIndex, setActiveIndex] = useState(0)
  const minQuantity = Math.max(1, product?.minQuantity ?? 1)
  const [quantity, setQuantity] = useState(minQuantity)
  // A ready-made box's greeting card message, written before it goes in the cart.
  const [cardMessage, setCardMessage] = useState('')
  const [cardOpen, setCardOpen] = useState(false)
  // A moment of "Added" on the box's button, as every other add-to-cart gives.
  const [bundleAdded, setBundleAdded] = useState(false)
  useEffect(() => {
    if (!bundleAdded) return
    const timer = window.setTimeout(() => setBundleAdded(false), 2000)
    return () => window.clearTimeout(timer)
  }, [bundleAdded])
  // Related products link here too, so the page stays mounted across ids:
  // a new product starts again from its own minimum.
  useEffect(() => {
    setQuantity(minQuantity)
  }, [product?.id, minQuantity])
  /**
   * The design this shopper made for this product, if any.
   *
   * Read once on mount rather than watched: the only thing that writes it is
   * the editor, which is a route away, so coming back here remounts the page
   * and re-reads it. Held in state purely so removing one updates the screen.
   */
  const [design, setDesign] = useState(() => readProductDesign(id ?? ''))

  // Once per product, once it has loaded — what "most viewed" is counted from.
  // `collection` says which campaign it was seen inside, if any.
  const viewedId = product?.id
  useEffect(() => {
    if (!product) return
    posthog?.capture('product viewed', {
      product_id: product.id,
      product_name: product.name,
      product_sku: product.sku,
      product_kind: product.kind ?? 'single',
      price: product.price,
      currency: product.currency,
      category_id: product.category,
      collection: collectionSlug,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedId])

  if (isLoading) {
    return <ProductDetailSkeleton />
  }

  if (!product || error) {
    const kind = error ? pageErrorKind(error) : 'notFound'
    return (
      <ErrorState
        kind={kind}
        title={kind === 'notFound' ? t('product.notFound') : undefined}
        onRetry={() => void refetch()}
        homeTo={shopHome}
        homeLabel={inFunnel ? t('common.backToCollection') : t('product.backToShop')}
      />
    )
  }

  const isBundle = product.kind === 'bundle'
  const contents = (product.components ?? []).filter((c) => c.role === 'item')
  const greetingCard = isBundle
    ? (product.components ?? []).find((c) => c.role === 'card') ?? null
    : null

  /** A ready-made box enters the cart as a box, so checkout prices it as one. */
  function addBundleToCart() {
    const box = bundleToBoxDetails(product!, { cardMessage })
    if (!box) return
    addItem(product!, quantity, box)
    setBundleAdded(true)
    posthog?.capture('bundle added to cart', {
      bundle_id: product!.id,
      bundle_sku: product!.sku,
      bundle_name: product!.name,
      quantity,
      price: product!.price,
      currency: product!.currency,
      has_message: Boolean(cardMessage.trim()),
      collection: collectionSlug,
    })
  }
  // Taken out of sale reads like sold out to a shopper; checkout refuses it too.
  const unavailable = product.stock === 0 || product.active === false

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
        <Link to={shopHome}>
          <ArrowLeft className="size-4" />
          {inFunnel ? t('common.backToCollection') : t('product.backToShop')}
        </Link>
      </Button>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="space-y-3">
          <div className="relative aspect-4/5 overflow-hidden rounded-brand bg-muted shadow-brand lg:aspect-square">
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
                    slot.own
                      ? t('product.viewYourDesign')
                      : t('product.viewImage', { index: i + 1 })
                  }
                  className={cn(
                    'relative aspect-square overflow-hidden rounded-brand border bg-muted transition-colors',
                    i === safeIndex
                      ? 'border-primary ring-1 ring-primary'
                      : 'border-border hover:border-primary/50',
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
                      {t('product.yours')}
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
          <ProductLabels labels={product.labels} size="md" />
          <p className="text-2xl font-bold text-primary">
            {formatPrice(product.price, product.currency)}
          </p>
          {product.stock !== undefined && (
            <p className="text-sm text-muted-foreground">
              {product.stock > 0
                ? t('product.inStock', { count: product.stock })
                : t('product.outOfStock')}
            </p>
          )}
          {/* Supplier copy can run to pages (a box's description carries its
              whole ordering process), so it scrolls inside a fixed height
              rather than pushing the price and contents out of view. */}
          <div className="max-h-72 overflow-y-auto whitespace-pre-line pr-2 leading-relaxed text-muted-foreground">
            {product.description}
          </div>

          {/* A pre-configured box is a parts list with a price, so what it
              holds belongs next to that price rather than in the details
              below — it is the thing being bought. */}
          {isBundle && contents.length > 0 && (
            <Card className="border-border bg-card/50">
              <CardContent className="space-y-2 p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide">
                  {t('product.inside')}
                </h2>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {contents.map((component) => (
                    <li key={component.product.id}>
                      —{' '}
                      {component.quantity > 1 && `${component.quantity}× `}
                      {component.product.name}
                    </li>
                  ))}
                </ul>
                {customizable && (
                  <p className="pt-1 text-xs text-muted-foreground">
                    {t('product.partsNote')}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex flex-col gap-2">
            {/* The editor was only reachable from the box builder, so someone
                looking at a single product had no way to put their logo on it
                without first starting a box they may not want. It sits above
                the buy button so the choice is visible at the moment of
                buying, without competing for the primary action's width. */}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {design && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={removeDesign}
                >
                  <Trash2 className="size-4" />
                  {t('product.discardDesign')}
                </Button>
              )}
              {/* A bundle has no surface of its own to print on — the things
                  inside it do, and those are designed in the builder. Neither
                  is offered when the campaign this was reached through sells
                  finished boxes only. */}
              {customizable && (
                <Button asChild size="sm" variant="outline">
                  <Link
                    to={
                      isBundle
                        ? `/build-box?bundle=${encodeURIComponent(product.id)}`
                        : designUrl
                    }
                  >
                    {isBundle ? (
                      <Pencil className="size-4" />
                    ) : (
                      <Palette className="size-4" />
                    )}
                    {isBundle
                      ? t('product.customiseBox')
                      : design
                        ? t('product.editYourDesign')
                        : t('product.customize')}
                  </Link>
                </Button>
              )}
            </div>
            {/* The box comes with a greeting card: its message can be written
                here, before it goes in the cart. Folded away, because it is
                optional and can also be sent later. */}
            {greetingCard && (
              <div className="rounded-brand border border-border">
                <button
                  type="button"
                  onClick={() => setCardOpen((open) => !open)}
                  aria-expanded={cardOpen}
                  aria-controls="bundle-card-message"
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium"
                >
                  <span>
                    {cardMessage.trim()
                      ? t('product.cardMessage.written')
                      : t('product.cardMessage.toggle')}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {greetingCard.product.name}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn('size-4 shrink-0 transition-transform', cardOpen && 'rotate-180')}
                  />
                </button>
                {cardOpen && (
                  <div id="bundle-card-message" className="space-y-2 border-t border-border px-4 py-3">
                    <Textarea
                      rows={5}
                      maxLength={GREETING_MAX_LENGTH}
                      value={cardMessage}
                      onChange={(e) => setCardMessage(e.target.value.slice(0, GREETING_MAX_LENGTH))}
                      placeholder={t('stepBuilder.card.messagePlaceholder')}
                      aria-label={t('stepBuilder.card.messageLabel')}
                    />
                    <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                      <span>{t('product.cardMessage.hint')}</span>
                      <span
                        className={cn(
                          'shrink-0 tabular-nums',
                          cardMessage.length >= GREETING_MAX_LENGTH - 20 && 'text-primary',
                        )}
                        aria-live="polite"
                      >
                        {cardMessage.length}/{GREETING_MAX_LENGTH}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <QuantityStepper
                value={quantity}
                onChange={setQuantity}
                min={minQuantity}
                className="h-11"
              />
              {isBundle ? (
                <Button
                  type="button"
                  size="lg"
                  className="flex-1 uppercase tracking-wider"
                  disabled={unavailable}
                  onClick={addBundleToCart}
                  aria-live="polite"
                >
                  {bundleAdded ? (
                    <>
                      <Check className="size-4" />
                      {t('card.added')}
                    </>
                  ) : unavailable ? (
                    t('card.outOfStock')
                  ) : (
                    <>
                      <ShoppingBag className="size-4" />
                      {t('product.addToCart')}
                    </>
                  )}
                </Button>
              ) : (
                <AddToCartButton
                  product={product}
                  quantity={quantity}
                  className="flex-1"
                  disabled={product.stock === 0}
                />
              )}
            </div>
          </div>

          {/* The design is not a preview — it is what the basket will carry, so
              say so where the decision is made rather than at checkout. */}
          {design && (
            <p className="rounded-brand border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              {t('product.designReady', {
                brief: design.prompt
                  ? t('product.andYourBrief', { prompt: design.prompt })
                  : '',
              })}
            </p>
          )}

          <Separator />

          <Card className="border-border bg-card/50">
            <CardContent className="space-y-2 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide">
                {t('product.details')}
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
          {t('product.youMightAlsoLike')}
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
