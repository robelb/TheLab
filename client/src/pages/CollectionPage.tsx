import { useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Gift, Loader2 } from 'lucide-react'
import { usePostHog } from '@posthog/react'
import { useCollection } from '@/hooks/use-collections'
import { useFunnel, useFunnelLink } from '@/context/FunnelContext'
import { useTaggedProducts } from '@/hooks/use-products'
import { hasChosenLocale, isLocale, type Locale } from '@/i18n'
import { rememberFunnelEntry } from '@/lib/funnel'
import { useAuth } from '@/context/AuthContext'
import { useDocumentMeta } from '@/hooks/use-document-meta'
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
  const { can, isLoading: authLoading } = useAuth()
  const staff = can('manage_all')

  const { data: collection, isLoading, isError } = useCollection(slug)

  // The collection's own language, for a visitor who has not expressed one. A
  // German campaign landing in English reads as somebody else's shop.
  //
  // It is a default, not a rule: a link that names a language has already been
  // applied by the detector, and somebody who has picked a language before is
  // telling us something this page does not get to overrule.
  useEffect(() => {
    if (!collection) return
    const asked = searchParams.get('lang')
    if (asked && isLocale(asked)) return
    if (hasChosenLocale()) return
    if (isLocale(collection.defaultLocale)) {
      void i18n.changeLanguage(collection.defaultLocale)
    }
  }, [collection, i18n, searchParams])

  // Remembered until checkout, so the request records which campaign it came
  // through and the marketing side can tie it back to the spend. Not for our
  // own team: they open these pages to check them, and a preview counted as a
  // visit muddies the numbers the page is being judged on.
  useEffect(() => {
    if (!slug || !collection || authLoading) return
    if (staff) return
    rememberFunnelEntry(slug, collection.allowCustomization)
    posthog?.capture('collection opened', {
      collection: slug,
      allow_customization: collection.allowCustomization,
    })
  }, [slug, collection, posthog, staff, authLoading])

  const locale = (i18n.language ?? 'de').split('-')[0] as Locale
  const pick = (text: { de: string; en: string } | null | undefined) =>
    text ? (text[locale] ?? text.de) : ''

  useDocumentMeta({
    title: collection ? `${pick(collection.title)} · big little things` : null,
    description: collection?.subtitle ? pick(collection.subtitle) : null,
  })

  // The rest of the catalogue for this occasion, bundles excluded — they are
  // already the headline above.
  // Held until the collection says which occasion to filter by.
  const catalogue = useTaggedProducts(collection?.tag, 'single')
  const funnelLink = useFunnelLink()
  // An ended campaign lets go of its visitors, so this is the shop there —
  // and another campaign they are still inside, if they are.
  const { shopHome } = useFunnel()

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
          <Link to={shopHome}>{t('collection.browseShop')}</Link>
        </Button>
      </div>
    )
  }

  const products = catalogue.data?.pages.flatMap((page) => page.data) ?? []
  const totalProducts = catalogue.data?.pages[0]?.pagination.total ?? 0

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
              {collection.allowCustomization
                ? t('collection.readyBoxesBody')
                : t('collection.readyBoxesBodyBuyOnly')}
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {collection.featuredBundles.map((bundle) => (
              <BundleCard
                key={bundle.id}
                bundle={bundle}
                allowCustomization={collection.allowCustomization}
                collectionSlug={collection.slug}
              />
            ))}
          </div>
        </section>
      )}

      {/* A page that sells finished boxes does not offer a builder — the ad
          promised one thing, and a second route is a decision to lose people at. */}
      {collection.allowCustomization && (
        <section className="rounded-brand border border-border/40 bg-muted/10 p-6 text-center sm:p-10">
          <Gift className="mx-auto size-8 text-primary" />
          <h2 className="mt-3 font-display text-2xl font-semibold">
            {t('collection.buildYourOwn')}
          </h2>
          <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
            {t('collection.buildYourOwnBody')}
          </p>
          <Button asChild size="lg" className="mt-5">
            {/* Carries the campaign, so the builder knows which one sent it. */}
            <Link to={funnelLink('/build-box')}>
              {t('collection.startBuilding')}
            </Link>
          </Button>
        </section>
      )}

      <section className="space-y-5">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-semibold">
            {t('collection.moreProducts')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {collection.allowCustomization
              ? t('collection.moreProductsBody')
              : t('collection.moreProductsBuyOnly')}
          </p>
        </div>

        {catalogue.isPending ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {collection.allowCustomization
              ? t('collection.noProducts')
              : t('collection.noProductsBuyOnly')}
          </p>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {products.map((product, i) => (
                <ProductCard key={product.id} product={product} index={i} />
              ))}
            </div>
            {catalogue.hasNextPage && (
              <div className="flex flex-col items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={catalogue.isFetchingNextPage}
                  onClick={() => void catalogue.fetchNextPage()}
                >
                  {catalogue.isFetchingNextPage && (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                  {t('collection.showMore')}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {t('collection.showingOf', {
                    shown: products.length,
                    total: totalProducts,
                  })}
                </p>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
