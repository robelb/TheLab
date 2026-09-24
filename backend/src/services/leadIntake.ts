import type { OutboundEvent, OutboundEventKind } from '../db/schema/index.js'
import { env } from '../config/env.js'
import { enqueue, registerOutboxHandler, type DeliveryResult } from './outbox.js'

/**
 * Delivery of lead and order events to the marketing side's intake endpoint.
 *
 * Queued through the outbox rather than fired inline: a shopper pressing "send
 * request" must never wait on somebody else's server, and must never see a
 * failure because that server is down.
 *
 * Every request carries `X-Event-Id` so the receiver can ignore an id it has
 * already seen — delivery is at-least-once.
 */

export function isLeadIntakeConfigured(): boolean {
  return Boolean(env.LEAD_INTAKE_URL)
}

/**
 * Record an event for delivery. Always writes the row, even with no endpoint
 * configured: pointing `LEAD_INTAKE_URL` at a real endpoint later drains the
 * backlog. Never throws.
 */
export async function enqueueLeadEvent(
  kind: OutboundEventKind,
  payload: Record<string, unknown>,
): Promise<void> {
  await enqueue('lead_intake', kind, payload)
}

async function deliver(event: OutboundEvent): Promise<DeliveryResult> {
  const response = await fetch(targetUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(env.LEAD_INTAKE_TOKEN
        ? { Authorization: `Bearer ${env.LEAD_INTAKE_TOKEN}` }
        : {}),
      'X-Event-Id': event.id,
      'X-Event-Kind': event.kind,
    },
    body: JSON.stringify(event.payload),
    signal: AbortSignal.timeout(env.LEAD_INTAKE_TIMEOUT_MS),
  })
  if (response.ok) return { ok: true }

  const body = (await response.text().catch(() => '')).slice(0, 500)
  // A rejected payload will be rejected again however long we wait. Only
  // "come back later" answers (408, 429) and server errors are worth a retry.
  return {
    ok: false,
    error: `HTTP ${response.status}${body ? `: ${body}` : ''}`,
    retryable:
      response.status >= 500 || response.status === 408 || response.status === 429,
  }
}

/**
 * The token goes in the Authorization header, and also on the query string —
 * the endpoint we were handed carries it there, and a receiver that reads only
 * the header ignores the extra parameter.
 */
function targetUrl(): string {
  if (!env.LEAD_INTAKE_TOKEN) return env.LEAD_INTAKE_URL
  try {
    const url = new URL(env.LEAD_INTAKE_URL)
    if (!url.searchParams.has('token')) {
      url.searchParams.set('token', env.LEAD_INTAKE_TOKEN)
    }
    return url.toString()
  } catch {
    return env.LEAD_INTAKE_URL
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

registerOutboxHandler({
  target: 'lead_intake',
  isConfigured: isLeadIntakeConfigured,
  deliver,
  describe: () => hostOf(env.LEAD_INTAKE_URL),
})
