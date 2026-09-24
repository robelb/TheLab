/**
 * Where a visit came from, remembered from the last ad click.
 *
 * An ad click arrives carrying a `gclid` and a set of UTM tags. Those are on
 * the URL of the landing page only — one click into the shop and they are gone
 * — so they are captured on arrival and kept until a request is sent, which is
 * the moment they become worth something to anybody. Sending one clears them.
 *
 * Last campaign touch: a new click with tags on it replaces what is stored,
 * while a visit without tags (a bookmark, a search result) leaves it alone. So
 * somebody who clicks a Christmas ad, leaves, and comes back through a search
 * result is still credited to the ad — but somebody who then clicks a second
 * ad is credited to that one. Google Ads imports conversions against the click
 * that produced them, and when paid traffic is split between two landing pages
 * the test is only readable if the request is tied to the page it came from.
 */

const ATTRIBUTION_KEY = 'atelier-attribution'

export interface Attribution {
  gclid?: string | null
  fbclid?: string | null
  msclkid?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmTerm?: string | null
  utmContent?: string | null
  /** The path they arrived on, e.g. `/c/weihnachten`. */
  landingPath?: string | null
  referrer?: string | null
  firstSeenAt?: string | null
}

/** URL parameter → the field it fills. */
const PARAM_MAP: Record<string, keyof Attribution> = {
  gclid: 'gclid',
  fbclid: 'fbclid',
  msclkid: 'msclkid',
  utm_source: 'utmSource',
  utm_medium: 'utmMedium',
  utm_campaign: 'utmCampaign',
  utm_term: 'utmTerm',
  utm_content: 'utmContent',
}

/** Long enough for any real tag, short enough to not be a payload. */
const MAX_VALUE = 256

function read(): Attribution | null {
  try {
    const raw = localStorage.getItem(ATTRIBUTION_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Attribution) : null
  } catch {
    return null
  }
}

function write(value: Attribution): void {
  try {
    localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(value))
  } catch {
    /* Private mode or a full store. Losing a tag is not worth an error. */
  }
}

/** What is on the current URL, trimmed and bounded. */
function fromUrl(search: string): Attribution {
  const params = new URLSearchParams(search)
  const found: Attribution = {}
  for (const [param, field] of Object.entries(PARAM_MAP)) {
    const value = params.get(param)?.trim()
    if (value) found[field] = value.slice(0, MAX_VALUE)
  }
  return found
}

/**
 * Capture campaign tags when this visit arrived with some.
 *
 * Returns whatever is stored afterwards, so a caller can register the same
 * values with analytics without reading twice.
 */
export function captureAttribution(
  location: { pathname: string; search: string } = window.location,
): Attribution | null {
  const stored = read()
  const incoming = fromUrl(location.search)
  const hasCampaign = Object.keys(incoming).length > 0

  // No tags on this visit: whatever the last click left stands.
  if (!hasCampaign) return stored

  const captured: Attribution = {
    ...incoming,
    landingPath: location.pathname.slice(0, 2048),
    referrer: document.referrer ? document.referrer.slice(0, 2048) : null,
    firstSeenAt: new Date().toISOString(),
  }
  write(captured)
  return captured
}

export function loadAttribution(): Attribution | null {
  return read()
}

/** After a request is sent: the next one has to come from a click of its own. */
export function clearAttribution(): void {
  try {
    localStorage.removeItem(ATTRIBUTION_KEY)
  } catch {
    /* ignore */
  }
}

/** Flat, snake-free copy for analytics properties. */
export function attributionProperties(
  attribution: Attribution | null,
): Record<string, string> {
  if (!attribution) return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(attribution)) {
    if (typeof value === 'string' && value) out[key] = value
  }
  return out
}
