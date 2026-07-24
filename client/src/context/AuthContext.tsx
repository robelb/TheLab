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
import { mapExtractionToBrand } from '@/lib/mapExtractionToBrand'
import {
  can as canRule,
  type Capability,
  type CapabilityContext,
  type Role,
} from '@/lib/roles'
import { useBrand } from '@/context/BrandContext'
import type { AuthAccount, AuthBundle, AuthCompany } from '@/types/auth'

const DEFAULT_BRAND_ID = 'airbnb'
const GUEST_KEY = 'shop-guest-session'

interface AuthContextValue {
  user: AuthAccount | null
  company: AuthCompany | null
  role: Role | null
  isAuthenticated: boolean
  isGuest: boolean
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

function loadGuest(): boolean {
  try {
    return localStorage.getItem(GUEST_KEY) === '1'
  } catch {
    return false
  }
}

function saveGuest(on: boolean) {
  try {
    if (on) localStorage.setItem(GUEST_KEY, '1')
    else localStorage.removeItem(GUEST_KEY)
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const posthog = usePostHog()
  const { applyExtractedBrand, clearExtractedBrand, selectBrand } = useBrand()

  const [user, setUser] = useState<AuthAccount | null>(null)
  const [company, setCompany] = useState<AuthCompany | null>(null)
  const [isGuest, setIsGuest] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const pollingRef = useRef(false)

  const applyGuestBrand = useCallback(() => {
    clearExtractedBrand()
    selectBrand(DEFAULT_BRAND_ID)
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
      setIsGuest(false)
      saveGuest(false)
      // Apply the persisted company brand — no re-extraction on login.
      if (bundle.company?.brand) {
        applyExtractedBrand(mapExtractionToBrand(bundle.company.brand))
      } else {
        clearExtractedBrand()
        selectBrand(DEFAULT_BRAND_ID)
      }
      posthog?.identify(bundle.user.id, {
        email: bundle.user.email,
        company: bundle.company?.domain ?? null,
        role: bundle.user.role,
      })
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

  // Bootstrap: hydrate from a stored token, else restore guest mode.
  useEffect(() => {
    const token = getToken()
    if (!token) {
      if (loadGuest()) {
        setIsGuest(true)
        applyGuestBrand()
      }
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
      // Fallback: plain guest browse if the demo account isn't available.
      clearToken()
      setUser(null)
      setCompany(null)
      setIsGuest(true)
      saveGuest(true)
      applyGuestBrand()
      queryClient.invalidateQueries({ queryKey: ['products'] })
      posthog?.capture('default shop opened')
    }
  }, [applyBundle, applyGuestBrand, queryClient, posthog])

  const logout = useCallback(() => {
    posthog?.capture('logged out')
    posthog?.reset()
    clearToken()
    saveGuest(false)
    setUser(null)
    setCompany(null)
    setIsGuest(false)
    clearExtractedBrand()
    queryClient.removeQueries({ queryKey: ['products'] })
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
      isAuthenticated: Boolean(user) || isGuest,
      isGuest,
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
      isGuest,
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
