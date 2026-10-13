import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { env } from '../config/env.js'

/**
 * Fetch a URL that came from outside — a shopper's logo link, a product
 * image, a company website — without letting it reach inside our network.
 *
 * Plain `fetch` with `redirect: 'follow'` will happily request
 * `http://169.254.169.254/` (a cloud host's metadata service, credentials
 * included), `http://localhost:…` or anything on the private network, and a
 * public URL can redirect to one. So: http(s) only, every hostname resolved
 * and every address checked, redirects followed by hand with each hop checked
 * again, a timeout, and a size cap. Our own API origin is allowed — generated
 * images are served from it.
 *
 * What it does not stop: a hostname whose DNS answer changes between our
 * check and the request (rebinding). Closing that needs the connection pinned
 * to the checked address; the window here is milliseconds.
 */

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BlockedUrlError'
  }
}

const MAX_REDIRECTS = 5

/** Whether an IP address is somewhere a request from us must never go. */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4) {
    const [a, b, c] = address.split('.').map(Number)
    return (
      a === 0 || // "this network"
      a === 10 ||
      a === 127 || // loopback
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local, cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) || // IETF, documentation
      (a === 198 && (b === 18 || b === 19)) || // benchmarking
      a >= 224 // multicast and reserved
    )
  }
  if (version === 6) {
    const groups = ipv6Groups(address)
    if (!groups) return true
    // IPv4 carried inside IPv6 — mapped (::ffff:a.b.c.d, however it is
    // written), the old compatible form (::a.b.c.d) and NAT64 (64:ff9b::/96) —
    // is judged as the IPv4 address it carries.
    const zeros = (from: number, to: number) => groups.slice(from, to).every((g) => g === 0)
    const embedded =
      (zeros(0, 5) && (groups[5] === 0xffff || groups[5] === 0)) ||
      (groups[0] === 0x64 && groups[1] === 0xff9b && zeros(2, 6))
    if (embedded && !(zeros(0, 8))) {
      const v4 = [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255].join('.')
      return isPrivateAddress(v4)
    }
    const first = groups[0]
    return (
      zeros(0, 8) || // ::
      (zeros(0, 7) && groups[7] === 1) || // ::1
      (first & 0xfe00) === 0xfc00 || // unique local fc00::/7
      (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
      (first & 0xff00) === 0xff00 // multicast
    )
  }
  return true
}

/** An IPv6 address as its eight 16-bit groups, or null if it will not parse. */
function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase().split('%')[0]
  // A trailing dotted IPv4 part becomes two hex groups.
  const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/)
  if (dotted) {
    const [a, b, c, d] = dotted[2].split('.').map(Number)
    text = `${dotted[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0
  if (fill < 0) return null
  const parts = [...head, ...Array(fill).fill('0'), ...tail]
  if (parts.length !== 8) return null
  const groups = parts.map((p) => (/^[0-9a-f]{1,4}$/.test(p) ? parseInt(p, 16) : NaN))
  return groups.some(Number.isNaN) ? null : groups
}

function ownOrigin(): string | null {
  try {
    return new URL(env.PUBLIC_API_URL).origin
  } catch {
    return null
  }
}

/** Throws `BlockedUrlError` unless the URL points somewhere public. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new BlockedUrlError('Not a valid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedUrlError('Only http and https addresses can be fetched')
  }
  if (url.username || url.password) {
    throw new BlockedUrlError('Addresses with credentials cannot be fetched')
  }
  // Our own API serves generated and uploaded images.
  if (url.origin === ownOrigin()) return url

  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true, verbatim: true }).catch(() => [])).map(
        (r) => r.address,
      )
  if (addresses.length === 0) throw new BlockedUrlError('The address could not be found')
  if (addresses.some(isPrivateAddress)) {
    throw new BlockedUrlError('That address is not reachable from here')
  }
  return url
}

/**
 * `fetch` for untrusted URLs — see above. Returns the response and the URL it
 * finally came from after redirects.
 */
export async function safeFetch(
  raw: string,
  init: { headers?: Record<string, string>; timeoutMs?: number; maxBytes?: number } = {},
): Promise<{ response: Response; finalUrl: string }> {
  const timeoutMs = init.timeoutMs ?? 30_000
  const maxBytes = init.maxBytes ?? 25 * 1024 * 1024
  const signal = AbortSignal.timeout(timeoutMs)

  let current = raw
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertPublicUrl(current)
    const response = await fetch(url, { headers: init.headers, redirect: 'manual', signal })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) return { response, finalUrl: url.href }
      current = new URL(location, url).href
      continue
    }

    const length = Number(response.headers.get('content-length') ?? 0)
    if (length > maxBytes) {
      throw new BlockedUrlError('The file is too large')
    }
    return { response, finalUrl: url.href }
  }
  throw new BlockedUrlError('Too many redirects')
}
