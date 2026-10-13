import { timingSafeEqual } from 'node:crypto'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { env } from '../../config/env.js'
import { flushAll } from '../../services/outbox.js'

/**
 * Calls made by our own infrastructure, never by a browser.
 *
 * `POST /internal/outbox/flush` sends whatever emails and webhooks are queued.
 * On a host that gives the process CPU only while it answers a request (Cloud
 * Run's default, and anything that scales to zero), the background timer
 * barely runs between visitors — so Cloud Scheduler calls this every minute
 * and the queue drains anyway. Harmless to call when nothing is queued.
 *
 * Guarded by `OUTBOX_FLUSH_TOKEN`, sent as `Authorization: Bearer <token>`.
 * Unset, the route does not exist.
 */
export const internalRouter = Router()

function bearerMatches(req: Request): boolean {
  const expected = env.OUTBOX_FLUSH_TOKEN
  const given = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  if (!expected || given.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected))
}

function requireFlushToken(req: Request, res: Response, next: NextFunction): void {
  if (!env.OUTBOX_FLUSH_TOKEN) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  if (!bearerMatches(req)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
}

internalRouter.post('/outbox/flush', requireFlushToken, async (_req, res) => {
  const started = Date.now()
  try {
    await flushAll()
    res.json({ ok: true, ms: Date.now() - started })
  } catch (err) {
    console.error('[internal] outbox flush failed:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Flush failed' })
  }
})
