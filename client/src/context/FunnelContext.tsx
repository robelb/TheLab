import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { isAxiosError } from 'axios'
import { useAuth } from '@/context/AuthContext'
import { useCollection } from '@/hooks/use-collections'
import { clearCampaignLock, loadCampaignLock } from '@/lib/funnel'

interface FunnelValue {
  /** The landing page this visit is inside, if any. */
  collectionSlug: string | null
  /** True while the visitor is following a campaign rather than browsing. */
  inFunnel: boolean
  /**
   * Whether building and branding a box is on offer.
   *
   * True everywhere outside a campaign — the shop itself always offers it —
   * and true inside one unless that campaign sells finished boxes only.
   */
  allowCustomization: boolean
  /**
   * The campaign's product tag, once the collection has loaded. What the
   * builder and "related products" narrow to, so neither is a side door into
   * the rest of the catalogue.
   */
  collectionTag: string | null
  /**
   * Where "home" is: the campaign's own page while inside one, the shop
   * otherwise. Every "back to shop" link points here.
   */
  shopHome: string
  /** False until the signed-in account is known — see `ShopGate`. */
  ready: boolean
}

const FunnelContext = createContext<FunnelValue>({
  collectionSlug: null,
  inFunnel: false,
  allowCustomization: true,
  collectionTag: null,
  shopHome: '/',
  ready: true,
})

/**
 * Which campaign, if any, this visit is inside.
 *
 * Taken from the URL where the URL says — the landing page names itself, and a
 * product carries `?from=` on the link that opened it — and from the lock
 * remembered on the way in everywhere else. Without the remembered half, the
 * cart, the checkout and a product two clicks deep would all be the ordinary
 * shop again.
 *
 * Once inside, there is no way back to the whole shop: a landing page is the
 * shop for somebody who arrived through it. Home is the campaign, and `/`
 * itself sends them there (see `ShopGate`). The lock lets go by itself when the
 * campaign ends or lapses — see `lib/funnel` — and never applies to the
 * platform's own administrators, who open these pages to check them and still
 * need the rest of the site afterwards.
 */
export function FunnelProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { can, isLoading: authLoading } = useAuth()
  const staff = can('manage_all')

  // Read off the path rather than from route params: this sits above the route
  // table so it can wrap the chrome, and there are no params to read up here.
  const onCollection = location.pathname.match(/^\/c\/([^/]+)/)
  const fromParam = searchParams.get('from')
  const lock = loadCampaignLock()

  const slug = staff
    ? // Staff still see a campaign's version of the page they are on, so a
      // preview looks like what a visitor gets; it just does not follow them.
      ((onCollection ? decodeURIComponent(onCollection[1]) : null) ??
      fromParam ??
      null)
    : ((onCollection ? decodeURIComponent(onCollection[1]) : null) ??
      fromParam ??
      lock?.slug ??
      null)

  // Already in cache whenever they arrived through the page itself, so this
  // costs a request only when someone opens a deep link cold.
  const { data: collection, error } = useCollection(slug ?? undefined)

  // An ended or deleted campaign has nothing to keep anybody inside; holding
  // them there would only show "no longer available" forever. A network
  // failure is not that, so only a real 404 lets them go.
  const gone = isAxiosError(error) && error.response?.status === 404
  useEffect(() => {
    if (gone && lock?.slug === slug) clearCampaignLock()
  }, [gone, lock?.slug, slug])

  const value = useMemo<FunnelValue>(() => {
    if (!slug || gone) {
      return {
        collectionSlug: null,
        inFunnel: false,
        allowCustomization: true,
        collectionTag: null,
        shopHome: '/',
        ready: !authLoading,
      }
    }
    // Until the collection loads, what was remembered beats guessing: it stops
    // the builder appearing for an instant on a page that forbids it. It only
    // describes the remembered page, so it says nothing about another one.
    const rememberedAllow =
      lock?.slug === slug ? lock.allowCustomization : true
    return {
      collectionSlug: slug,
      inFunnel: true,
      allowCustomization: collection
        ? collection.allowCustomization
        : rememberedAllow,
      collectionTag: collection?.tag ?? null,
      shopHome: `/c/${slug}`,
      ready: !authLoading,
    }
  }, [slug, gone, collection, lock?.slug, lock?.allowCustomization, authLoading])

  return (
    <FunnelContext.Provider value={value}>{children}</FunnelContext.Provider>
  )
}

export function useFunnel(): FunnelValue {
  return useContext(FunnelContext)
}

/**
 * The shop's front page, unless this visit belongs to a campaign.
 *
 * Wraps the `/` route. The links are already pointed elsewhere, but `/` is
 * still one typed URL, one back button or one bookmark away — so the page
 * itself sends a campaign visitor back to their campaign. Waits for the account
 * to be known, or an administrator would be bounced before their session had
 * restored.
 */
export function ShopGate({ children }: { children: ReactNode }) {
  const { inFunnel, shopHome, ready } = useFunnel()
  if (!ready) return null
  if (inFunnel) return <Navigate to={shopHome} replace />
  return <>{children}</>
}

/**
 * A link that stays inside the campaign.
 *
 * Every link to a product has to carry the campaign, or the page it opens will
 * offer what the campaign withheld. This is that, in one place.
 */
export function useFunnelLink(): (path: string) => string {
  const { collectionSlug } = useFunnel()
  return (path: string) => {
    if (!collectionSlug) return path
    const separator = path.includes('?') ? '&' : '?'
    return `${path}${separator}from=${encodeURIComponent(collectionSlug)}`
  }
}
