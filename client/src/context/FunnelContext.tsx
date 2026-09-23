import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useCollection } from '@/hooks/use-collections'
import { clearFunnelEntry, loadFunnelEntry } from '@/lib/funnel'

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
}

const FunnelContext = createContext<FunnelValue>({
  collectionSlug: null,
  inFunnel: false,
  allowCustomization: true,
})

/**
 * The way out.
 *
 * A campaign holds for as long as the visitor is following it, which is not
 * something any single URL can express — the cart, the checkout and a product
 * page reached from a box are all still inside it. So it is remembered, and
 * asking for the shop itself is what ends it. That is the one place a visitor
 * can say "show me everything", and in a focused campaign it is the only link
 * that leads there.
 */
const EXIT_PATH = '/'

/**
 * Which campaign, if any, this visit is inside.
 *
 * Taken from the URL where the URL says — the landing page names itself, and a
 * product carries `?from=` on the link that opened it — and from what was
 * remembered on the way in everywhere else. Without the remembered half, a
 * campaign that sells finished boxes would still hand somebody the builder
 * through the cart's "edit box", or through a related product two clicks deep.
 */
export function FunnelProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [searchParams] = useSearchParams()

  // Read off the path rather than from route params: this sits above the route
  // table so it can wrap the chrome, and there are no params to read up here.
  const onCollection = location.pathname.match(/^\/c\/([^/]+)/)
  const fromParam = searchParams.get('from')
  const leaving = location.pathname === EXIT_PATH

  // Asking for the shop ends the campaign, so the next page is the ordinary
  // one rather than the campaign's stripped-down version of it.
  useEffect(() => {
    if (leaving) clearFunnelEntry()
  }, [leaving])

  const remembered = leaving ? null : loadFunnelEntry()

  const slug = leaving
    ? null
    : ((onCollection ? decodeURIComponent(onCollection[1]) : null) ??
      fromParam ??
      remembered?.collectionSlug ??
      null)

  // Already in cache whenever they arrived through the page itself, so this
  // costs a request only when someone opens a deep link cold.
  const { data: collection } = useCollection(slug ?? undefined)

  const value = useMemo<FunnelValue>(() => {
    if (!slug) {
      return { collectionSlug: null, inFunnel: false, allowCustomization: true }
    }
    // Until the collection loads, what was remembered beats guessing: it stops
    // the builder appearing for an instant on a page that forbids it.
    const allow = collection
      ? collection.allowCustomization
      : (remembered?.allowCustomization ?? true)
    return { collectionSlug: slug, inFunnel: true, allowCustomization: allow }
  }, [slug, collection, remembered?.allowCustomization])

  return (
    <FunnelContext.Provider value={value}>{children}</FunnelContext.Provider>
  )
}

export function useFunnel(): FunnelValue {
  return useContext(FunnelContext)
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
