import { isAxiosError } from 'axios'

/**
 * What kind of failure an error is, as far as the person looking at the screen
 * is concerned.
 *
 * They can act on very few of these: check their connection, wait a moment, or
 * go somewhere else. Everything the UI says about an error starts from this, so
 * a dropped Wi-Fi never reads as "this product does not exist", and a missing
 * page never offers a "try again" that cannot work.
 */
export type ErrorKind =
  /** The browser says there is no connection at all. */
  | 'offline'
  /** No answer from the server: dropped connection, timeout, server down. */
  | 'network'
  /** The thing asked for is not there (404). */
  | 'notFound'
  /** Too many requests (429). */
  | 'rateLimited'
  /** The server answered, but failed (5xx). */
  | 'server'
  /** Anything else, including a crash in the page itself. */
  | 'unknown'

export function errorKind(err: unknown): ErrorKind {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'
  if (!isAxiosError(err)) return 'unknown'
  if (!err.response) return 'network'
  const { status } = err.response
  if (status === 404) return 'notFound'
  if (status === 429) return 'rateLimited'
  if (status >= 500) return 'server'
  return 'unknown'
}

/** Worth trying again automatically: the next attempt may well work. */
export function isTransientError(err: unknown): boolean {
  const kind = errorKind(err)
  return kind === 'offline' || kind === 'network' || kind === 'server'
}

/**
 * The kind, for a page whose whole content is one record (a product, a
 * collection): any refusal other than "slow down" means there is nothing here
 * for this address — a malformed id is as missing as a deleted one.
 */
export function pageErrorKind(err: unknown): ErrorKind {
  const kind = errorKind(err)
  if (kind !== 'unknown' || !isAxiosError(err)) return kind
  const status = err.response?.status ?? 0
  return status >= 400 && status < 500 ? 'notFound' : kind
}
