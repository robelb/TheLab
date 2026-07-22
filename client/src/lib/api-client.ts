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
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error?.response?.status === 401 &&
      typeof window !== 'undefined' &&
      window.location.pathname !== '/login'
    ) {
      clearToken()
      window.location.assign('/login')
    }
    return Promise.reject(error)
  },
)
