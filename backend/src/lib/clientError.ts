import { BlockedUrlError } from './safeFetch.js'
import { publicErrorMessage } from './dbErrors.js'

/**
 * What to tell the caller when a request fails unexpectedly.
 *
 * An error's own message is written for us, not for them: a failed query
 * carries its SQL and parameters, an AI provider's error its response body, a
 * failed image fetch the URL it tried and the status it got back. None of that
 * belongs in a response — it tells an outsider what we call, where, and how.
 *
 * So the caller gets `fallback`, unless the message is one written for them:
 * a blocked address, or one of the `known` messages a route throws on purpose
 * ("Product not found"). The real error is logged either way.
 */
export function clientMessage(
  err: unknown,
  fallback: string,
  options: { known?: string[]; log?: string } = {},
): string {
  const message = err instanceof Error ? err.message : String(err)
  if (options.log) console.warn(`[${options.log}]`, message)
  if (err instanceof BlockedUrlError) return err.message
  if (err instanceof Error && options.known?.includes(err.message)) {
    return publicErrorMessage(err, fallback)
  }
  return fallback
}
