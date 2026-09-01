/**
 * Helpers for saved design versions.
 *
 * Versions used to live in `localStorage` and auto-write on every confirmation.
 * They are now user-triggered, named, and stored server-side — see
 * `@/api/designVersions` — so the approved set is a real company record rather
 * than one browser's cache. What is left here is the formatting, plus a
 * one-shot rescue of anything the old build accumulated.
 */

import type { PlacementLayout } from '@/types/layout'

/** The key the pre-server build wrote to. Read once, then dropped. */
const LEGACY_STORAGE_KEY = 'atelier-design-versions'

/** "14:32 · 25 Aug" — enough to tell two of today's versions apart. */
export function versionStamp(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })} · ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
}

/**
 * "Saved 14:32 · 25 Aug", and the edit time too once it differs.
 *
 * Renaming is the only edit a version has, so the two stamps are usually the
 * same — showing both unconditionally would be noise on every row.
 */
export function versionStamps(createdAt: string, updatedAt: string): string {
  const created = versionStamp(createdAt)
  const updated = versionStamp(updatedAt)
  if (!updated || updated === created) return created
  return `${created} · edited ${updated}`
}

interface LegacyVersion {
  label: string
  createdAt: number
  source: string
  flat: string
  photoreal: string | null
  prompt: string | null
  layout: PlacementLayout | null
  logoUrl: string | null
}

export interface LegacyUpload {
  label: string
  source: string
  flat: string | null
  photoreal: string | null
  prompt: string | null
  layout: PlacementLayout | null
  logoUrl: string | null
}

/**
 * Hand back anything the old local build saved for this product, once.
 *
 * The key is cleared for the product on the way out whether or not the upload
 * that follows succeeds: these entries were never visible in the UI, so losing
 * one is a smaller cost than retrying an upload on every page load forever.
 * Oldest first, so they land in the order they were made.
 */
export function takeLegacyVersions(productId: string): LegacyUpload[] {
  if (!productId) return []
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return []
    const store = JSON.parse(raw) as Record<string, unknown>
    if (!store || typeof store !== 'object') return []

    const mine = store[productId]
    const { [productId]: _taken, ...rest } = store
    if (Object.keys(rest).length) {
      localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(rest))
    } else {
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    }

    if (!Array.isArray(mine)) return []
    return (mine as LegacyVersion[])
      .filter((v) => v && typeof v.source === 'string' && v.source)
      .map((v) => ({
        label: v.label || 'Recovered version',
        source: v.source,
        flat: v.flat || null,
        photoreal: v.photoreal ?? null,
        prompt: v.prompt ?? null,
        layout: v.layout ?? null,
        logoUrl: v.logoUrl ?? null,
      }))
      .filter((v) => Boolean(v.flat || v.photoreal))
      .reverse()
  } catch {
    return []
  }
}
