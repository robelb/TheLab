import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { usePostHog } from '@posthog/react'
import { toast } from 'sonner'
import { demoLoginRequest, fetchMe, loginRequest, signupRequest } from '@/api/auth'
import { clearToken, getToken, setToken } from '@/lib/auth-token'
import { TOKEN_EXPIRED_EVENT } from '@/lib/api-client'
import { getDefaultPreset } from '@/config/brands'
import { mapExtractionToBrand } from '@/lib/mapExtractionToBrand'
import {
  can as canRule,
  type Capability,
  type CapabilityContext,
  type Role,
} from '@/lib/roles'
import { useBrand } from '@/context/BrandContext'
import { CART_STORAGE_KEY } from '@/context/CartContext'
import { PRODUCT_DESIGNS_STORAGE_KEY } from '@/lib/productDesign'
import type { AuthAccount, AuthBundle, AuthCompany } from '@/types/auth'

/**
 * What the shop looks like to somebody with no company behind it.
 *
 * This used to be a hard-coded demo brand, which was harmless while every
 * visitor signed in first. Now that an ad click lands straight on the
 * storefront, the signed-out shop is the house's own shop and has to wear the
 * house's own brand.
 */
const houseBrandId = () => getDefaultPreset().id

interface AuthContextValue {
  user: AuthAccount | null
  company: AuthCompany | null
  role: Role | null
  isAuthenticated: boolean
  isLoading: boolean
  /** The company's domain (used by campaigns), or null for guests. */
  domain: string | null
  /** Cache-bust key for branded product images. */
  brandGeneration: string | null
  login: (email: string, password: string) => Promise<void>
  signup: (name: string, email: string, password: string) => Promise<void>
  loginWithDefault: () => Promise<void>
  logout: () => void
  can: (capability: Capability, ctx?: CapabilityContext) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const posthog = usePostHog()
  const { applyExtractedBrand, clearExtractedBrand, selectBrand } = useBrand()

  const [user, setUser] = useState<AuthAccount | null>(null)
  const [company, setCompany] = useState<AuthCompany | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const pollingRef = useRef(false)

  const applyHouseBrand = useCallback(() => {
    clearExtractedBrand()
    selectBrand(houseBrandId())
  }, [clearExtractedBrand, selectBrand])

  /**
   * The theme (colors/fonts/logo) is applied synchronously at signup. The slow
   * featured-product image generation runs in the background — while the
   * company's `imagesStatus` is 'pending', poll `/me` (with a toast) until it
   * flips, then refresh product images so the branded mockups appear.
   */
  const pollImagesUntilReady = useCallback(async () => {
    if (pollingRef.current) return
    pollingRef.current = true
    const TOAST_ID = 'brand-images'
    toast.loading('Generating your product mockups…', {
      id: TOAST_ID,
      description: 'Applying your logo to featured products. This takes a minute.',
      duration: Infinity,
    })
    try {
      for (let attempt = 0; attempt < 45; attempt++) {
        await new Promise((r) => setTimeout(r, 4000))
        let bundle: AuthBundle
        try {
          bundle = await fetchMe()
        } catch {
          continue // transient — keep polling
        }
        const status = bundle.company?.imagesStatus
        if (!status || status === 'pending') continue

        // Finished — pick up the new generation and refresh product images.
        setUser(bundle.user)
        setCompany(bundle.company)
        queryClient.invalidateQueries({ queryKey: ['products'] })

        if (status === 'ready') {
          toast.success('Your product mockups are ready!', {
            id: TOAST_ID,
            description: 'Featured products now show your logo.',
            duration: 5000,
          })
        } else if (status === 'failed') {
          toast.error('We couldn’t generate your product mockups.', {
            id: TOAST_ID,
            description:
              bundle.company?.imagesError ??
              'You can retry from Company settings.',
            duration: 6000,
          })
        } else {
          toast.dismiss(TOAST_ID) // skipped — nothing to show
        }
        return
      }
      toast.dismiss(TOAST_ID) // timed out; leave current state as-is
    } finally {
      pollingRef.current = false
    }
  }, [queryClient])

  const applyBundle = useCallback(
    (bundle: AuthBundle) => {
      setUser(bundle.user)
      setCompany(bundle.company)
      // Apply the persisted company brand — no re-extraction on login.
      if (bundle.company?.brand) {
        applyExtractedBrand(mapExtractionToBrand(bundle.company.brand))
      } else {
        clearExtractedBrand()
        selectBrand(houseBrandId())
      }
      posthog?.identify(bundle.user.id, {
        email: bundle.user.email,
        company: bundle.company?.domain ?? null,
        role: bundle.user.role,
      })
      // On every event, so the dashboards can leave out our own team opening
      // pages to check them — see `scripts/posthog-dashboard.ts`.
      // `register` throws when PostHog never initialised (no token set).
      if (posthog?.__loaded) {
        posthog.register({ is_staff: bundle.user.role === 'super_admin' })
      }
      // Theme is applied above; featured-product images may still be generating
      // in the background → watch for completion and refresh when ready.
      if (bundle.company?.imagesStatus === 'pending') {
        void pollImagesUntilReady()
      }
    },
    [
      applyExtractedBrand,
      clearExtractedBrand,
      selectBrand,
      posthog,
      pollImagesUntilReady,
    ],
  )

  // Bootstrap: hydrate from a stored token. With no token there is nothing to
  // restore — the shop simply renders signed out, which is a valid way to use it.
  useEffect(() => {
    const token = getToken()
    if (!token) {
      setIsLoading(false)
      return
    }
    let cancelled = false
    fetchMe()
      .then((bundle) => {
        if (!cancelled) applyBundle(bundle)
      })
      .catch(() => {
        clearToken()
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await loginRequest({ email, password })
      setToken(result.token)
      applyBundle(result)
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    [applyBundle, queryClient],
  )

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      const result = await signupRequest({ name, email, password })
      setToken(result.token)
      applyBundle(result)
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    [applyBundle, queryClient],
  )

  const loginWithDefault = useCallback(async () => {
    // The "BLT demo" logs in as the demo company account so the shop loads that
    // company's brand + its branded product images (via the normal authed path).
    try {
      const result = await demoLoginRequest()
      setToken(result.token)
      applyBundle(result)
      queryClient.invalidateQueries({ queryKey: ['products'] })
      posthog?.capture('blt demo opened')
    } catch {
      // The demo account is unavailable. Browsing signed out is a first-class
      // way to use the shop now, so that is where this lands rather than in an
      // error — the house brand, the plain catalogue, and a working cart.
      clearToken()
      setUser(null)
      setCompany(null)
      applyHouseBrand()
      queryClient.invalidateQueries({ queryKey: ['products'] })
      posthog?.capture('default shop opened')
    }
  }, [applyBundle, applyHouseBrand, queryClient, posthog])

  /**
   * A stored token that the API has just rejected.
   *
   * Clears the session in place and leaves the person where they were: on the
   * storefront that is a signed-out shop, which is browsable, and interrupting
   * them with a login page would be worse than the expiry itself.
   */
  useEffect(() => {
    const onExpired = () => {
      setUser(null)
      setCompany(null)
      applyHouseBrand()
      queryClient.removeQueries({ queryKey: ['products'] })
      queryClient.removeQueries({ queryKey: ['orders'] })
      queryClient.removeQueries({ queryKey: ['campaigns'] })
    }
    window.addEventListener(TOKEN_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(TOKEN_EXPIRED_EVENT, onExpired)
  }, [applyHouseBrand, queryClient])

  const logout = useCallback(() => {
    posthog?.capture('logged out')
    posthog?.reset()
    clearToken()
    setUser(null)
    setCompany(null)
    clearExtractedBrand()
    queryClient.removeQueries({ queryKey: ['products'] })
    // A company's own requests and campaigns must not survive into the next
    // person's session on the same machine.
    queryClient.removeQueries({ queryKey: ['orders'] })
    queryClient.removeQueries({ queryKey: ['campaigns'] })
    // The cart holds the last person's box, their designs and their company's
    // pricing. Leaving it behind hands all of that to whoever signs in next on
    // a shared machine. The designs kept against single products are the same
    // person's work and go with it — otherwise the next shopper opens a product
    // and finds someone else's logo already on it.
    try {
      localStorage.removeItem(CART_STORAGE_KEY)
      localStorage.removeItem(PRODUCT_DESIGNS_STORAGE_KEY)
    } catch {
      // A blocked or full store is no reason to fail the sign-out.
    }
  }, [clearExtractedBrand, queryClient, posthog])

  const can = useCallback(
    (capability: Capability, ctx?: CapabilityContext) => {
      const principal = user
        ? { role: user.role, companyId: user.companyId }
        : null
      return canRule(principal, capability, ctx)
    },
    [user],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      company,
      role: user?.role ?? null,
      isAuthenticated: Boolean(user),
      isLoading,
      domain: company?.domain ?? null,
      brandGeneration: company?.brandGeneration ?? null,
      login,
      signup,
      loginWithDefault,
      logout,
      can,
    }),
    [
      user,
      company,
      isLoading,
      login,
      signup,
      loginWithDefault,
      logout,
      can,
    ],
  )

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
