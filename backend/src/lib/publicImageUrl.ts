import { env } from '../config/env.js'
import { isSupabaseStorageConfigured } from '../services/supabaseStorage.js'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

/** Public object URL for a path inside the configured Supabase bucket. */
export function supabasePublicObjectUrl(objectPath: string): string {
  const base = env.SUPABASE_URL.replace(/\/$/, '')
  const bucket = env.SUPABASE_STORAGE_BUCKET
  const path = objectPath.replace(/^\//, '')
  return `${base}/storage/v1/object/public/${bucket}/${path}`
}

/** Absolute URL for an image served from this API (`/api/uploads`, `/api/customized`). */
export function apiPublicImageUrl(relativePath: string): string {
  const base = env.PUBLIC_API_URL.replace(/\/$/, '')
  const path = relativePath.startsWith('/') ? relativePath : `/${relativePath}`
  return `${base}${path}`
}

/**
 * Rewrite stale localhost URLs (or bare `/api/...` paths) to the configured
 * public origin. When Supabase Storage is configured, known API paths are
 * mapped to their bucket objects.
 */
export function normalizePublicImageUrl(
  url: string | null | undefined,
): string | null {
  if (!url?.trim()) return null

  const trimmed = url.trim()
  if (trimmed.startsWith('/api/')) {
    return resolveApiPath(trimmed, '')
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return trimmed
  }

  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    return trimmed
  }

  return resolveApiPath(parsed.pathname, parsed.search)
}

function resolveApiPath(pathname: string, search: string): string {
  const useSupabase = isSupabaseStorageConfigured()

  const customized = pathname.match(/^\/api\/customized\/(.+)$/)
  if (customized && useSupabase) {
    return supabasePublicObjectUrl(`custome/${customized[1]}`) + search
  }

  const upload = pathname.match(/^\/api\/uploads\/([^/]+)$/)
  if (upload && useSupabase) {
    return supabasePublicObjectUrl(`productPicture/${upload[1]}`) + search
  }

  return apiPublicImageUrl(pathname + search)
}

export function normalizePublicImageUrls(
  urls: string[] | null | undefined,
): string[] {
  if (!urls?.length) return []
  return urls.map((u) => normalizePublicImageUrl(u) ?? u)
}
