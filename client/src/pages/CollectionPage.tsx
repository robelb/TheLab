import { useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Gift, Loader2 } from 'lucide-react'
import { usePostHog } from '@posthog/react'
import { useCollection } from '@/hooks/use-collections'
import { useProducts } from '@/hooks/use-products'
import { isLocale, type Locale } from '@/i18n'
import { rememberFunnelEntry } from '@/lib/funnel'
import { BundleCard } from '@/components/BundleCard'
import { ProductCard } from '@/components/ProductCard'
import { ProductCardSkeleton } from '@/components/ProductCardSkeleton'
import { Button } from '@/components/ui/button'

/**
 * Where an ad click lands.
 *
 * One page, one occasion: a headline, the boxes worth buying outright, a way
 * into the builder, and the rest of the catalogue filtered to the same thing.
 * No login, no configuration before the first price is visible — the whole
 * reason this page exists is that asking somebody to sign up before they can
 * see what a Christmas box costs loses them.
 */
export function CollectionPage() {
  const { slug } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()
  const { t, i18n } = useTranslation()
  const posthog = usePostHog()

  const { data: collection, isLoading, isError } = useCollection(slug)

  // The collection's own language, unless the link asked for one. A German
  // campaign landing in English reads as somebody else's shop.
  useEffect(() => {
    if (!collection) return
    const asked = searchParams.get('lang')
    if (asked && isLocale(asked)) return // the detector already applied it
    if (isLocale(collection.defaultLocale)) {
      void i18n.changeLanguage(collection.defaultLocale)
    }
  }, [collection, i18n, searchParams])

  // Remembered until checkout, so the request records which campaign it came
  // through and the marketing side can tie it back to the spend.
  useEffect(() => {
    if (!slug) return
    rememberFunnelEntry(slug)
    posthog?.capture('collection opened', { collection: slug })
  }, [slug, posthog])

  const locale = (i18n.language ?? 'de').split('-')[0] as Locale
  const pick = (text: { de: string; en: string } | null | undefined) =>
    text ? (text[locale] ?? text.de) : ''

  // The rest of the catalogue for this occasion, bundles excluded — they are
  // already the headline above.
  const catalogue = useProducts({
    page: 1,
    limit: 20,
    tag: collection?.tag,
    kind: 'single',
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError || !collection) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <h1 className="font-display text-3xl font-bold">
          {t('collection.notFound')}
        </h1>
        <p className="max-w-sm text-muted-foreground">
          {t('collection.notFoundBody')}
        </p>
        <Button asChild size="lg">
          <Link to="/">{t('collection.browseShop')}</Link>
        </Button>
      </div>
    )
  }

  const products = catalogue.data?.data ?? []

  return (
    <div className="space-y-14">
      <header className="space-y-3 text-center">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">
          {pick(collection.title)}
        </h1>
        {collection.subtitle && (
          <p className="mx-auto max-w-2xl text-muted-foreground">
            {pick(collection.subtitle)}
          </p>
        )}
      </header>

      {collection.featuredBundles.length > 0 && (
        <section className="space-y-5">
          <div className="space-y-1">
            <h2 className="font-display text-2xl font-semibold">
              {t('collection.readyBoxes')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('collection.readyBoxesBody')}
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {collection.featuredBundles.map((bundle) => (
              <BundleCard key={bundle.id} bundle={bundle} />
            ))}
          </div>
        </section>
      )}

      <section className="rounded-brand border border-border/40 bg-muted/10 p-6 text-center sm:p-10">
        <Gift className="mx-auto size-8 text-primary" />
        <h2 className="mt-3 font-display text-2xl font-semibold">
          {t('collection.buildYourOwn')}
        </h2>
        <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
          {t('collection.buildYourOwnBody')}
        </p>
        <Button asChild size="lg" className="mt-5">
          <Link to="/build-box">{t('collection.startBuilding')}</Link>
        </Button>
      </section>

      <section className="space-y-5">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-semibold">
            {t('collection.moreProducts')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('collection.moreProductsBody')}
          </p>
        </div>

        {catalogue.isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('collection.noProducts')}
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((product, i) => (
              <ProductCard key={product.id} product={product} index={i} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
