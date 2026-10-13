import { and, eq, lte, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  outboundEvents,
  type OutboundEvent,
  type OutboundEventKind,
} from '../db/schema/index.js'

/**
 * Everything that leaves this app on somebody else's schedule — the marketing
 * webhook, customer emails — goes through `outbound_events` first.
 *
 * The row is written inside the request and the send happens after it, so a
 * shopper never waits on a third party and never sees a failure because one is
 * down. A failed send is retried with backoff.
 *
 * Each integration registers a handler for its own `target` and only ever
 * claims rows bound for it: an email is not a webhook, and the webhook must not
 * pick one up just because it happens to be due.
 *
 * Delivery is at-least-once. A send that times out after the receiver already
 * committed will be retried, so every handler is given the event id to dedupe on.
 */

export type OutboxTarget = 'lead_intake' | 'email'

export type DeliveryResult =
  | { ok: true }
  | { ok: false; error: string; retryable: boolean }

export interface OutboxHandler {
  target: OutboxTarget
  /** Unconfigured handlers still queue; they just never send. */
  isConfigured(): boolean
  deliver(event: OutboundEvent): Promise<DeliveryResult>
  /** Shown once at startup, e.g. where the webhook points. */
  describe?(): string
}

/** How many due events one pass will attempt. */
const BATCH = 20
/**
 * Gives up after this many tries. With the backoff below (30 s doubling, then
 * every 6 h) that is about two days — long enough to ride out a provider
 * outage or a weekend with the mail account locked.
 */
const MAX_ATTEMPTS = 16
const BASE_BACKOFF_MS = 30_000
const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000
const LOOP_INTERVAL_MS = 30_000
/** A send that started longer ago than this died with its process. */
const STUCK_AFTER = "interval '5 minutes'"

const handlers = new Map<OutboxTarget, OutboxHandler>()

export function registerOutboxHandler(handler: OutboxHandler): void {
  handlers.set(handler.target, handler)
}

/**
 * Record an event for delivery.
 *
 * Always writes the row, even with the handler unconfigured: the queue then
 * doubles as the log of what would have been sent, and configuring it later
 * drains the backlog.
 *
 * Never throws. Nothing sent from here is worth losing an order over.
 */
export async function enqueue(
  target: OutboxTarget,
  kind: OutboundEventKind,
  payload: Record<string, unknown>,
  options: { flush?: boolean } = {},
): Promise<string | null> {
  let id: string
  try {
    const [row] = await db
      .insert(outboundEvents)
      .values({ kind, target, payload })
      .returning({ id: outboundEvents.id })
    id = row.id
  } catch (err) {
    // Loud on purpose: this is an email or a lead that will never go out.
    console.error(
      `[outbox:${target}] could not queue ${kind} ${JSON.stringify(payload)}:`,
      errorMessage(err),
    )
    return null
  }
  if (options.flush !== false && handlers.get(target)?.isConfigured()) void flush(target)
  return id
}

/** What became of one event that somebody is waiting on. */
export type SendOutcome =
  | { status: 'sent' }
  | { status: 'failed'; error: string; willRetry: boolean }
  /** The handler is not configured: the row waits in the queue. */
  | { status: 'queued' }

/**
 * Deliver one queued event now and say how it went, for the times a person
 * clicked a button and is waiting to hear whether it worked.
 *
 * The row stays the record either way, and a retryable failure is left
 * pending, so the loop still tries again later.
 */
export async function sendNow(target: OutboxTarget, id: string): Promise<SendOutcome> {
  const handler = handlers.get(target)
  if (!handler?.isConfigured()) return { status: 'queued' }

  const claimed = await db
    .update(outboundEvents)
    .set({ status: 'sending', claimedAt: new Date() })
    .where(and(eq(outboundEvents.id, id), eq(outboundEvents.status, 'pending')))
    .returning()
  if (claimed[0]) return run(handler, claimed[0])

  // The background loop got there first; wait for it to finish.
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const [row] = await db.select().from(outboundEvents).where(eq(outboundEvents.id, id))
    if (!row) break
    if (row.status === 'sent') return { status: 'sent' }
    if (row.status === 'failed') {
      return { status: 'failed', error: row.lastError ?? 'Unknown error', willRetry: false }
    }
    if (row.status === 'pending' && row.attempts > 0) {
      return { status: 'failed', error: row.lastError ?? 'Unknown error', willRetry: true }
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return { status: 'queued' }
}

/** One flush at a time per target per process; the loop and enqueue both call in. */
const flushing = new Set<OutboxTarget>()

/**
 * Send everything due for one target.
 *
 * Rows are claimed with a conditional update before being sent, so two
 * instances flushing at once cannot both take the same event. The Neon HTTP
 * driver has no interactive transactions, which is why the claim is a single
 * statement rather than a select-then-update.
 */
export async function flush(target: OutboxTarget): Promise<void> {
  const handler = handlers.get(target)
  if (!handler?.isConfigured() || flushing.has(target)) return
  flushing.add(target)
  try {
    const due = await db
      .select()
      .from(outboundEvents)
      .where(
        and(
          eq(outboundEvents.target, target),
          eq(outboundEvents.status, 'pending'),
          lte(outboundEvents.nextAttemptAt, new Date()),
        ),
      )
      .orderBy(outboundEvents.createdAt)
      .limit(BATCH)

    for (const event of due) {
      const claimed = await db
        .update(outboundEvents)
        .set({ status: 'sending', claimedAt: new Date() })
        .where(
          and(
            eq(outboundEvents.id, event.id),
            eq(outboundEvents.status, 'pending'),
          ),
        )
        .returning({ id: outboundEvents.id })
      // Somebody else took it between the select and here.
      if (claimed.length === 0) continue
      await run(handler, event)
    }
  } catch (err) {
    console.warn(`[outbox:${target}] flush failed:`, errorMessage(err))
  } finally {
    flushing.delete(target)
  }
}

async function run(handler: OutboxHandler, event: OutboundEvent): Promise<SendOutcome> {
  const attempts = event.attempts + 1
  let result: DeliveryResult
  try {
    result = await handler.deliver(event)
  } catch (err) {
    // Network error, DNS, a timeout — all worth another try.
    result = { ok: false, error: errorMessage(err), retryable: true }
  }

  if (result.ok) {
    await db
      .update(outboundEvents)
      .set({ status: 'sent', attempts, sentAt: new Date(), lastError: null })
      .where(eq(outboundEvents.id, event.id))
    return { status: 'sent' }
  }
  const willRetry = await reschedule(
    handler.target,
    event.id,
    attempts,
    result.error,
    result.retryable,
  )
  return { status: 'failed', error: result.error, willRetry }
}

async function reschedule(
  target: OutboxTarget,
  id: string,
  attempts: number,
  lastError: string,
  retryable: boolean,
): Promise<boolean> {
  const exhausted = attempts >= MAX_ATTEMPTS
  const giveUp = !retryable || exhausted
  const delay = Math.min(BASE_BACKOFF_MS * 2 ** (attempts - 1), MAX_BACKOFF_MS)
  await db
    .update(outboundEvents)
    .set({
      status: giveUp ? 'failed' : 'pending',
      attempts,
      lastError: lastError.slice(0, 1000),
      nextAttemptAt: new Date(Date.now() + delay),
    })
    .where(eq(outboundEvents.id, id))
  if (giveUp) {
    console.warn(
      `[outbox:${target}] giving up on ${id} after ${attempts} attempt(s): ${lastError}`,
    )
  } else {
    console.warn(
      `[outbox:${target}] attempt ${attempts} for ${id} failed, retrying in ${Math.round(delay / 1000)}s: ${lastError}`,
    )
  }
  return !giveUp
}

/**
 * Retry anything left behind by a crash or a restart, forever after.
 *
 * Also un-sticks rows left in `sending` by a process that died mid-flight:
 * nobody is going to finish those, and at-least-once means a possible duplicate
 * is better than a dropped one.
 */
const timers: NodeJS.Timeout[] = []

export function startOutbox(): void {
  for (const handler of handlers.values()) {
    const { target } = handler
    if (!handler.isConfigured()) {
      console.log(`  Outbox ${target}: disabled (not configured) — events are queued only`)
      continue
    }
    void recoverAndFlush(target)
    // Every pass also recovers, so a send that died is picked up again while
    // this process runs — not only when the next one starts.
    const timer = setInterval(() => void recoverAndFlush(target), LOOP_INTERVAL_MS)
    timer.unref()
    timers.push(timer)
    console.log(
      `  Outbox ${target}: running${handler.describe ? ` → ${handler.describe()}` : ''}`,
    )
  }
}

/** Stop the timers, for a clean shutdown. Sends already under way finish. */
export function stopOutbox(): void {
  for (const timer of timers.splice(0)) clearInterval(timer)
}

/**
 * One full pass over every configured target: recover what is stuck, send
 * what is due, and wait until it is done.
 *
 * What a scheduler calls (`POST /internal/outbox/flush`) on a host that only
 * gives the process CPU while it answers a request — Cloud Run's default —
 * where the timers above would otherwise barely run.
 */
export async function flushAll(): Promise<void> {
  await Promise.all(
    [...handlers.values()]
      .filter((h) => h.isConfigured())
      .map((h) => recoverAndFlush(h.target)),
  )
}

/**
 * Put back in the queue anything whose send started minutes ago and never
 * finished — its process died. Judged by when the SEND started, not when the
 * row was created: a retry hours later is not stuck just because it is old,
 * and reclaiming it while another instance is sending it means a duplicate.
 */
async function recoverAndFlush(target: OutboxTarget): Promise<void> {
  try {
    await db
      .update(outboundEvents)
      .set({ status: 'pending' })
      .where(
        and(
          eq(outboundEvents.target, target),
          eq(outboundEvents.status, 'sending'),
          sql`coalesce(${outboundEvents.claimedAt}, ${outboundEvents.createdAt}) < now() - ${sql.raw(STUCK_AFTER)}`,
        ),
      )
  } catch (err) {
    console.warn(`[outbox:${target}] recovery failed:`, errorMessage(err))
  }
  await flush(target)
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
