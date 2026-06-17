import axios from 'axios'

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
