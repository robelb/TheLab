import type { NextFunction, Request, Response } from 'express'

/**
 * A simple per-caller throttle: at most `max` requests in any `windowMs`.
 *
 * Callers are counted by account when signed in, otherwise by IP address
 * (`req.ip`, which is the visitor's own address only when `trust proxy` is set
 * for the host — see TRUST_PROXY_HOPS in config/env.ts).
 *
 * In memory, so it resets on deploy and does not span instances. It is meant
 * to stop a script hammering an endpoint — sign-in guessing, or running up the
 * AI bill — not a determined, distributed attacker; that belongs at the edge.
 */
export function rateLimit(options: {
  /** What the limit is for, so a 429 can be traced to its limiter. */
  name: string
  windowMs: number
  max: number
  /** What the caller is told; a 429 either way. */
  message?: string
}) {
  const hits = new Map<string, number[]>()
  const message = options.message ?? 'Too many requests. Please try again later.'

  return (req: Request, res: Response, next: NextFunction): void => {
    const caller = req.authUser ? `user:${req.authUser.id}` : `ip:${req.ip ?? 'unknown'}`
    const now = Date.now()
    const recent = (hits.get(caller) ?? []).filter((t) => now - t < options.windowMs)

    if (recent.length >= options.max) {
      hits.set(caller, recent)
      const retryAfter = Math.ceil((recent[0] + options.windowMs - now) / 1000)
      res.setHeader('Retry-After', String(Math.max(1, retryAfter)))
      res.setHeader('X-RateLimit-Policy', options.name)
      res.status(429).json({ error: message })
      return
    }
    recent.push(now)
    hits.set(caller, recent)

    // Keep the map from growing without bound on a long-lived process.
    if (hits.size > 10_000) {
      for (const [key, times] of hits) {
        if (times.every((t) => now - t >= options.windowMs)) hits.delete(key)
      }
    }
    next()
  }
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** Sign-in attempts — slows down password guessing. */
export const loginLimit = rateLimit({
  name: 'login',
  windowMs: 15 * MINUTE,
  max: 20,
  message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
})

/** Anything that runs a paid AI or image model. */
export const aiLimit = rateLimit({
  name: 'ai',
  windowMs: HOUR,
  max: 60,
  message: 'You have reached the limit for generated images for now. Please try again later.',
})

/** Fetching and analysing a website — slow, and paid. */
export const extractLimit = rateLimit({
  name: 'extract',
  windowMs: HOUR,
  max: 10,
})

/** File uploads: images, logos and videos. */
export const uploadLimit = rateLimit({
  name: 'upload',
  windowMs: HOUR,
  max: 60,
  message: 'Too many uploads. Please try again later.',
})

/** Order requests from guests; signed-in shoppers are counted per account. */
export const orderLimit = rateLimit({
  name: 'order',
  windowMs: HOUR,
  max: 10,
  message: 'Too many requests from here. Try again later.',
})
