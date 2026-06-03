import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { extractBrand } from '@/api/extract'
import { getDefaultPreset, presetToConfig } from '@/config/brands'
import { domainInputSchema } from '@/lib/domainSchema'
import { mapExtractionToBrand } from '@/lib/mapExtractionToBrand'
import { useBrand } from '@/context/BrandContext'
import { AxiosError } from 'axios'

const SESSION_KEY = 'shop-domain-session'
const DEFAULT_BRAND_ID = 'airbnb'

export type ShopSessionMode = 'default' | 'extracted'

export interface ShopSession {
  mode: ShopSessionMode
  domain: string | null
  sourceUrl: string
  loggedInAt: string
  customizationGeneration?: number
}

interface AuthContextValue {
  session: ShopSession | null
  isAuthenticated: boolean
  login: (domainInput: string) => Promise<void>
  loginWithDefault: () => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function loadSession(): ShopSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ShopSession & { domain?: string }
    if (parsed.mode === 'default' || parsed.mode === 'extracted') {
      return parsed
    }
    if (parsed.domain) {
      return {
        mode: 'extracted',
        domain: parsed.domain,
        sourceUrl: parsed.sourceUrl,
        loggedInAt: parsed.loggedInAt,
      }
    }
    return null
  } catch {
    return null
  }
}

function saveSession(session: ShopSession | null) {
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } else {
    localStorage.removeItem(SESSION_KEY)
  }
}

function isStaleExtractedSession(
  session: ShopSession | null,
  hasExtractedBrand: boolean,
): boolean {
  return session?.mode === 'extracted' && !hasExtractedBrand
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const {
    applyExtractedBrand,
    clearExtractedBrand,
    hasExtractedBrand,
    selectBrand,
  } = useBrand()

  const [session, setSession] = useState<ShopSession | null>(() => {
    const stored = loadSession()
    if (isStaleExtractedSession(stored, hasExtractedBrand)) {
      saveSession(null)
      return null
    }
    return stored
  })

  const isAuthenticated = Boolean(session)

  useEffect(() => {
    if (session?.mode === 'default') {
      clearExtractedBrand()
      selectBrand(DEFAULT_BRAND_ID)
    }
  }, [session?.mode, clearExtractedBrand, selectBrand])

  const loginWithDefault = useCallback(() => {
    clearExtractedBrand()
    selectBrand(DEFAULT_BRAND_ID)
    const preset = getDefaultPreset()
    const config = presetToConfig(preset)
    const nextSession: ShopSession = {
      mode: 'default',
      domain: null,
      sourceUrl: config.sourceUrl,
      loggedInAt: new Date().toISOString(),
    }
    saveSession(nextSession)
    setSession(nextSession)
    queryClient.invalidateQueries({ queryKey: ['products'] })
  }, [clearExtractedBrand, selectBrand, queryClient])

  const login = useCallback(
    async (domainInput: string) => {
      const parsed = domainInputSchema.safeParse({ domain: domainInput })
      if (!parsed.success) {
        const message =
          parsed.error.flatten().fieldErrors.domain?.[0] ??
          'Invalid domain'
        throw new Error(message)
      }

      try {
        const payload = await extractBrand(parsed.data.domain)
        const brand = mapExtractionToBrand(payload)
        applyExtractedBrand(brand)

        if (payload.customizationError) {
          console.warn('[customize]', payload.customizationError)
        } else if (payload.customizationSkipped) {
          console.warn('[customize] skipped:', payload.customizationSkipped)
        } else if (payload.customizedProducts?.length) {
          console.info(
            '[customize] updated products:',
            payload.customizedProducts.map((p) => p.productId).join(', '),
          )
        }

        const nextSession: ShopSession = {
          mode: 'extracted',
          domain: parsed.data.domain,
          sourceUrl: brand.sourceUrl,
          loggedInAt: new Date().toISOString(),
          customizationGeneration:
            payload.customizationGeneration ?? Date.now(),
        }
        saveSession(nextSession)
        setSession(nextSession)
        queryClient.invalidateQueries({ queryKey: ['products'] })
      } catch (err) {
        if (err instanceof AxiosError) {
          const message =
            err.response?.data?.error ?? 'Could not extract brand for this domain'
          throw new Error(message)
        }
        throw err
      }
    },
    [applyExtractedBrand, queryClient],
  )

  const logout = useCallback(() => {
    saveSession(null)
    setSession(null)
    clearExtractedBrand()
    queryClient.removeQueries({ queryKey: ['products'] })
  }, [clearExtractedBrand, queryClient])

  const value = useMemo(
    () => ({
      session,
      isAuthenticated,
      login,
      loginWithDefault,
      logout,
    }),
    [session, isAuthenticated, login, loginWithDefault, logout],
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
