import { and, eq, lte, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  outboundEvents,
  type OutboundEvent,
  type OutboundEventKind,
} from '../db/schema/index.js'
import { env } from '../config/env.js'

/**
 * Delivery of lead and order events to the marketing side's intake endpoint.
 *
 * Queued rather than fired inline. Two reasons: a shopper pressing "send
 * request" must never wait on somebody else's server, and must never see a
 * failure because that server is down. The row is written inside the request,
 * the send happens after it, and a failed send is retried on a schedule.
 *
 * Delivery is at-least-once. A send that times out after the receiver already
 * committed will be retried, so every request carries `X-Event-Id` and the
 * receiver is expected to ignore an id it has seen.
 */

const TARGET = 'lead_intake'
/** How many due events one pass will attempt. */
const BATCH = 20
/** Gives up after this many tries — roughly two days of backoff. */
const MAX_ATTEMPTS = 8
const BASE_BACKOFF_MS = 30_000
const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000
const LOOP_INTERVAL_MS = 30_000

export function isLeadIntakeConfigured(): boolean {
  return Boolean(env.LEAD_INTAKE_URL)
}

/**
 * Record an event for delivery.
 *
 * Always writes the row, even with no endpoint configured: the queue then
 * doubles as the log of what would have been sent, and pointing
 * `LEAD_INTAKE_URL` at a real endpoint later drains the backlog.
 *
 * Never throws. A webhook is not worth losing an order over.
 */
export async function enqueueLeadEvent(
  kind: OutboundEventKind,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(outboundEvents).values({ kind, target: TARGET, payload })
  } catch (err) {
    console.warn('[leadIntake] could not queue event:', errorMessage(err))
    return
  }
  if (isLeadIntakeConfigured()) void flushOutbound()
}

/** One flush at a time per process; the loop and enqueue both call in. */
let flushing = false

/**
 * Send everything that is due.
 *
 * Rows are claimed with a conditional update before being sent, so two
 * instances flushing at once cannot both take the same event. The Neon HTTP
 * driver has no interactive transactions, which is why the claim is a single
 * statement rather than a select-then-update.
 */
export async function flushOutbound(): Promise<void> {
  if (flushing || !isLeadIntakeConfigured()) return
  flushing = true
  try {
    const due = await db
      .select()
      .from(outboundEvents)
      .where(
        and(
          eq(outboundEvents.status, 'pending'),
          lte(outboundEvents.nextAttemptAt, new Date()),
        ),
      )
      .orderBy(outboundEvents.createdAt)
      .limit(BATCH)

    for (const event of due) {
      const claimed = await db
        .update(outboundEvents)
        .set({ status: 'sending' })
        .where(
          and(
            eq(outboundEvents.id, event.id),
            eq(outboundEvents.status, 'pending'),
          ),
        )
        .returning({ id: outboundEvents.id })
      // Somebody else took it between the select and here.
      if (claimed.length === 0) continue
      await deliver(event)
    }
  } catch (err) {
    console.warn('[leadIntake] flush failed:', errorMessage(err))
  } finally {
    flushing = false
  }
}

async function deliver(event: OutboundEvent): Promise<void> {
  const attempts = event.attempts + 1
  try {
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

    if (response.ok) {
      await db
        .update(outboundEvents)
        .set({
          status: 'sent',
          attempts,
          sentAt: new Date(),
          lastError: null,
        })
        .where(eq(outboundEvents.id, event.id))
      return
    }

    const body = (await response.text().catch(() => '')).slice(0, 500)
    const message = `HTTP ${response.status}${body ? `: ${body}` : ''}`
    // A rejected payload will be rejected again however long we wait. Only
    // "come back later" answers (408, 429) and server errors are worth a retry.
    const retryable =
      response.status >= 500 || response.status === 408 || response.status === 429
    await reschedule(event.id, attempts, message, retryable)
  } catch (err) {
    // Network error, DNS, or our own timeout — all worth another try.
    await reschedule(event.id, attempts, errorMessage(err), true)
  }
}

async function reschedule(
  id: string,
  attempts: number,
  lastError: string,
  retryable: boolean,
): Promise<void> {
  const exhausted = attempts >= MAX_ATTEMPTS
  const giveUp = !retryable || exhausted
  const delay = Math.min(BASE_BACKOFF_MS * 2 ** (attempts - 1), MAX_BACKOFF_MS)
  await db
    .update(outboundEvents)
    .set({
      status: giveUp ? 'failed' : 'pending',
      attempts,
      lastError,
      nextAttemptAt: new Date(Date.now() + delay),
    })
    .where(eq(outboundEvents.id, id))
  if (giveUp) {
    console.warn(
      `[leadIntake] giving up on ${id} after ${attempts} attempt(s): ${lastError}`,
    )
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

/**
 * Retry anything left behind by a crash or a restart, forever after.
 *
 * Also un-sticks rows left in `sending` by a process that died mid-flight:
 * nobody is going to finish those, and at-least-once means a possible duplicate
 * is better than a dropped lead.
 */
export function startOutboundLoop(): void {
  if (!isLeadIntakeConfigured()) {
    console.log('[leadIntake] disabled (LEAD_INTAKE_URL not set)')
    return
  }
  void recoverStuck()
  const timer = setInterval(() => void flushOutbound(), LOOP_INTERVAL_MS)
  timer.unref()
  console.log(`[leadIntake] queue running → ${hostOf(env.LEAD_INTAKE_URL)}`)
}

async function recoverStuck(): Promise<void> {
  try {
    await db
      .update(outboundEvents)
      .set({ status: 'pending' })
      .where(
        and(
          eq(outboundEvents.status, 'sending'),
          lte(outboundEvents.nextAttemptAt, new Date(Date.now() + 1)),
          sql`${outboundEvents.createdAt} < now() - interval '5 minutes'`,
        ),
      )
  } catch (err) {
    console.warn('[leadIntake] recovery failed:', errorMessage(err))
  }
  void flushOutbound()
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
