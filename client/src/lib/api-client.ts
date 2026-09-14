import axios from 'axios'
import { clearToken, getToken } from '@/lib/auth-token'
import { getGuestSessionId } from '@/lib/guest-session'

/**
 * Fired when a stored token turns out to be dead.
 *
 * `AuthContext` listens and drops back to a signed-out storefront. The shop is
 * browsable without an account, so an expired session is something to clear,
 * not something to interrupt anybody over.
 */
export const TOKEN_EXPIRED_EVENT = 'auth:token-expired'

/** Backend origin; in dev without this set, Vite proxies `/api` instead. */
function resolveApiBaseUrl(): string {
  const origin = import.meta.env.VITE_API_URL?.trim()
  if (origin) {
    return `${origin.replace(/\/$/, '')}/api`
  }
  return '/api'
}

export const apiClient = axios.create({
  baseURL: resolveApiBaseUrl(),
  headers: { 'Content-Type': 'application/json' },
  timeout: 220_000,
})

// Attach the bearer token (if any) to every request, and always the guest
// session id — a signed-out visitor still creates campaigns, and that is what
// says which ones are theirs.
apiClient.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  } else {
    config.headers['X-Guest-Session'] = getGuestSessionId()
  }
  return config
})

// On 401 the token is stale or invalid: drop it. Where that leaves the person
// depends on where they are.
//
// The storefront is open to anyone, so bouncing a browsing visitor to a login
// page over a background request is throwing them out of a shop they were
// welcome in — and for a guest, who never had a token, there is nothing to be
// expired in the first place. Only the dashboard genuinely needs an account, so
// only the dashboard redirects.
//
// Only 401. A 403 means the account is real but may not do this particular
// thing, and signing someone out over it throws away a working session in the
// middle of whatever they were doing.
//
// The redirect is a full page load rather than a router navigation — the
// interceptor sits below React and has no router to call — so where the person
// was has to travel in the URL. `RequireAuth` puts the same thing in router
// state; both end up at the same place, and both are read back by the sign-in
// page.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const hadToken = Boolean(error?.config?.headers?.Authorization)
    if (
      error?.response?.status === 401 &&
      hadToken &&
      typeof window !== 'undefined' &&
      window.location.pathname !== '/login'
    ) {
      clearToken()
      if (window.location.pathname.startsWith('/dashboard')) {
        const here = `${window.location.pathname}${window.location.search}`
        window.location.assign(`/login?next=${encodeURIComponent(here)}`)
      } else {
        window.dispatchEvent(new Event(TOKEN_EXPIRED_EVENT))
      }
    }
    return Promise.reject(error)
  },
)
