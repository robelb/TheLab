import axios from 'axios'
import { clearToken, getToken } from '@/lib/auth-token'

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

// Attach the bearer token (if any) to every request.
apiClient.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// On 401 the token is stale/invalid: drop it and bounce to login (unless we're
// already there — e.g. a failed login attempt should just surface its error).
//
// Only 401. A 403 means the account is real but may not do this particular
// thing, and signing someone out over it throws away a working session in the
// middle of whatever they were doing.
//
// This is a full page load rather than a router navigation — the interceptor
// sits below React and has no router to call — so where the person was has to
// travel in the URL. `RequireAuth` puts the same thing in router state; both
// end up at the same place, and both are read back by the sign-in page.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error?.response?.status === 401 &&
      typeof window !== 'undefined' &&
      window.location.pathname !== '/login'
    ) {
      clearToken()
      const here = `${window.location.pathname}${window.location.search}`
      window.location.assign(`/login?next=${encodeURIComponent(here)}`)
    }
    return Promise.reject(error)
  },
)
