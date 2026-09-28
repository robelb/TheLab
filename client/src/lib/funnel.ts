/**
 * Which landing page a visitor came in through, and which one they are in now.
 *
 * Two records, because they answer different questions and end at different
 * times:
 *
 * - The *entry* is attribution. Kept next to the campaign tags rather than
 *   inside them: the tags say what click was paid for, this says which of our
 *   own pages it landed on. It rides along to checkout and is cleared when the
 *   request is sent — a second order is a new visit, not the same click.
 *
 * - The *lock* is what the visitor is inside. A landing page is the whole shop
 *   for somebody who arrived through it, so while it holds, the storefront's
 *   logo and every "back to shop" lead to that page instead. It survives
 *   checkout — sending a request is no reason to hand them the catalogue —
 *   and ends when they open the shop's front page themselves, after
 *   `LOCK_TTL_MS`, or when the campaign ends.
 */

const FUNNEL_KEY = 'atelier-funnel'
const LOCK_KEY = 'atelier-campaign-lock'

/** How long a landing page keeps a visitor, counted from their last visit to it. */
const LOCK_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface FunnelEntry {
  /** The page that brought them in — first touch, for attribution. */
  collectionSlug: string
  enteredAt: string
}

export interface CampaignLock {
  /**
   * The page they are following now.
   *
   * Not always the one they entered through: somebody who arrived through one
   * campaign and then opened another is inside the second, and what the second
   * offers is what applies.
   */
  slug: string
  /**
   * Whether that page offered building a box.
   *
   * Kept here so the cart and the checkout — which are part of the same
   * journey but know nothing about collections — can stay as focused as the
   * page that started it, without a lookup on every render.
   */
  allowCustomization: boolean
  /** Last time they opened the page; the lock lapses `LOCK_TTL_MS` after it. */
  seenAt: string
}

export function rememberFunnelEntry(
  collectionSlug: string,
  allowCustomization: boolean,
): void {
  try {
    // First touch for attribution, like the campaign tags: the page that
    // brought them in is the one that earned the lead, not the one they
    // wandered to afterwards.
    if (!loadFunnelEntry()) {
      const entry: FunnelEntry = {
        collectionSlug,
        enteredAt: new Date().toISOString(),
      }
      localStorage.setItem(FUNNEL_KEY, JSON.stringify(entry))
    }
    // The lock follows the page they are on, and every visit renews it.
    const lock: CampaignLock = {
      slug: collectionSlug,
      allowCustomization,
      seenAt: new Date().toISOString(),
    }
    localStorage.setItem(LOCK_KEY, JSON.stringify(lock))
  } catch {
    /* Private mode. Losing the slug costs attribution, not the order. */
  }
}

export function loadFunnelEntry(): FunnelEntry | null {
  try {
    const raw = localStorage.getItem(FUNNEL_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const entry = parsed as Partial<FunnelEntry>
    return entry.collectionSlug
      ? { collectionSlug: entry.collectionSlug, enteredAt: entry.enteredAt ?? '' }
      : null
  } catch {
    return null
  }
}

/** The attribution only. The visitor stays inside their campaign. */
export function clearFunnelEntry(): void {
  try {
    localStorage.removeItem(FUNNEL_KEY)
  } catch {
    /* ignore */
  }
}

export function loadCampaignLock(): CampaignLock | null {
  try {
    const raw = localStorage.getItem(LOCK_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return null
      const lock = parsed as Partial<CampaignLock>
      if (!lock.slug) return null
      const seen = Date.parse(lock.seenAt ?? '')
      if (Number.isFinite(seen) && Date.now() - seen > LOCK_TTL_MS) {
        clearCampaignLock()
        return null
      }
      return {
        slug: lock.slug,
        // Entries written before this existed predate buy-only pages.
        allowCustomization: lock.allowCustomization !== false,
        seenAt: lock.seenAt ?? '',
      }
    }
    return migrateLegacyEntry()
  } catch {
    return null
  }
}

/**
 * Entries written before the lock had a record of its own carried the current
 * page inside the attribution entry. Moved across once, so nobody inside a
 * campaign today is let out by the upgrade — and stripped from the entry, so a
 * lock cleared later is not brought back from it.
 */
function migrateLegacyEntry(): CampaignLock | null {
  const legacy = JSON.parse(localStorage.getItem(FUNNEL_KEY) ?? 'null') as {
    collectionSlug?: string
    enteredAt?: string
    currentSlug?: string
    allowCustomization?: boolean
  } | null
  if (!legacy || !('allowCustomization' in legacy)) return null
  const slug = legacy.currentSlug ?? legacy.collectionSlug
  if (legacy.collectionSlug) {
    const entry: FunnelEntry = {
      collectionSlug: legacy.collectionSlug,
      enteredAt: legacy.enteredAt ?? '',
    }
    localStorage.setItem(FUNNEL_KEY, JSON.stringify(entry))
  }
  if (!slug) return null
  const lock: CampaignLock = {
    slug,
    allowCustomization: legacy.allowCustomization !== false,
    seenAt: new Date().toISOString(),
  }
  localStorage.setItem(LOCK_KEY, JSON.stringify(lock))
  return lock
}

/** Let them out — they went to the shop, the campaign ended, or the lock lapsed. */
export function clearCampaignLock(): void {
  try {
    localStorage.removeItem(LOCK_KEY)
  } catch {
    /* ignore */
  }
}
