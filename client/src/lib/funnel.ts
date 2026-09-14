/**
 * Which landing page a visitor came in through, if any.
 *
 * Kept next to the campaign tags rather than inside them: the tags say what
 * click was paid for, this says which of our own pages it landed on. Both ride
 * along to checkout so a request can be tied back to the campaign that earned
 * it. Cleared when the request is sent.
 */

const FUNNEL_KEY = 'atelier-funnel'

export interface FunnelEntry {
  collectionSlug: string
  enteredAt: string
}

export function rememberFunnelEntry(collectionSlug: string): void {
  try {
    const existing = loadFunnelEntry()
    // First touch, like the campaign tags: the page that brought them in is
    // the one that earned the lead, not the one they wandered to afterwards.
    if (existing) return
    const entry: FunnelEntry = {
      collectionSlug,
      enteredAt: new Date().toISOString(),
    }
    localStorage.setItem(FUNNEL_KEY, JSON.stringify(entry))
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

export function clearFunnelEntry(): void {
  try {
    localStorage.removeItem(FUNNEL_KEY)
  } catch {
    /* ignore */
  }
}
