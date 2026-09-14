const GUEST_SESSION_KEY = 'atelier-guest-session'

/**
 * A stable id for a browser with nobody signed in.
 *
 * Boxes built without an account still create a campaign server-side, and that
 * campaign has to belong to somebody or anyone could edit it by guessing its
 * id. This is that somebody: created on first use, sent as a header on every
 * request, and meaningless to anyone but this browser.
 *
 * Not a security boundary — it is a claim, not a credential. It keeps one
 * visitor's draft out of another's hands, and nothing more is asked of it.
 */
export function getGuestSessionId(): string {
  try {
    const existing = localStorage.getItem(GUEST_SESSION_KEY)
    if (existing && existing.length >= 8) return existing
    const fresh = crypto.randomUUID()
    localStorage.setItem(GUEST_SESSION_KEY, fresh)
    return fresh
  } catch {
    // Private mode, or storage turned off. A per-tab id still lets this page's
    // own renders work; it just will not survive a reload.
    return memoryFallback()
  }
}

let inMemory: string | null = null

function memoryFallback(): string {
  if (!inMemory) inMemory = crypto.randomUUID()
  return inMemory
}
