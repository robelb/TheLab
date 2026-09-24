import { PostHog } from 'posthog-node'
import { env } from '../config/env.js'

/**
 * Product analytics for what happens on the server.
 *
 * The client records the visit; this records what follows once the shopper
 * has left — an order being quoted, confirmed, paid. Sent one at a time rather
 * than batched: there are a handful a day, and a batch still waiting when a
 * deploy restarts the process would be lost.
 */
const client = env.POSTHOG_PROJECT_TOKEN
  ? new PostHog(env.POSTHOG_PROJECT_TOKEN, {
      host: env.POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    })
  : null

export function captureServerEvent(params: {
  distinctId: string
  event: string
  properties?: Record<string, unknown>
}): void {
  if (!client) return
  try {
    client.capture(params)
  } catch (err) {
    // Analytics never gets to fail a request.
    console.warn('[analytics] capture failed:', err instanceof Error ? err.message : err)
  }
}
