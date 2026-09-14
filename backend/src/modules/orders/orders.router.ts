import { Router } from 'express'
import { routeParam } from '../../lib/routeParam.js'
import type { ZodError } from 'zod'
import type { Request } from 'express'
import { optionalAuth, requireAuth } from '../../middleware/auth.js'
import { ROLES } from '../../lib/roles.js'
import { createOrderSchema, updateOrderSchema } from './orders.schema.js'
import {
  createOrder,
  getOrder,
  listOrders,
  setOrderStatus,
} from './orders.service.js'

function firstZodError(error: ZodError): string {
  const { fieldErrors, formErrors } = error.flatten()
  const field = Object.values(fieldErrors).flat().find(Boolean)
  return field ?? formErrors[0] ?? 'Invalid request'
}

export const ordersRouter = Router()

/**
 * Sending a request no longer needs an account; reading them still does.
 *
 * The ad funnel takes people from a landing page to checkout without ever
 * asking them to sign up, so `POST /` only attaches whoever happens to be
 * signed in. Everything else is company data and stays behind `requireAuth`
 * per route.
 */
ordersRouter.use(optionalAuth)

/**
 * Crude per-IP throttle for the one anonymous write in the API.
 *
 * In memory, so it resets on deploy and does not span instances — which is
 * fine for what it is for: stopping a script hammering the endpoint, not
 * stopping a determined attacker. Anything stronger belongs at the edge.
 */
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const RATE_LIMIT_MAX = 10
const recentByIp = new Map<string, number[]>()

function rateLimited(req: Request): boolean {
  // A signed-in user is already accountable.
  if (req.authUser) return false
  const ip = req.ip ?? 'unknown'
  const now = Date.now()
  const seen = (recentByIp.get(ip) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  )
  if (seen.length >= RATE_LIMIT_MAX) {
    recentByIp.set(ip, seen)
    return true
  }
  seen.push(now)
  recentByIp.set(ip, seen)

  // Keep the map from growing without bound on a long-lived process.
  if (recentByIp.size > 5000) {
    for (const [key, times] of recentByIp) {
      if (times.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) {
        recentByIp.delete(key)
      }
    }
  }
  return false
}

/**
 * Which company's requests this caller may touch.
 *
 * `null` means a global administrator, who sees every company's. Anyone else
 * without a company is authenticated but has nothing to own a request — that is
 * a permission problem, not an identity one, so it answers 403 and leaves their
 * session alone.
 */
function scopeFor(req: {
  authUser?: { role?: string; companyId?: string | null }
}): { companyId: string | null } | null {
  if (req.authUser?.role === ROLES.SUPER_ADMIN) return { companyId: null }
  const companyId = req.authUser?.companyId
  return companyId ? { companyId } : null
}

const NO_COMPANY = 'A company account is needed to work with requests.'

ordersRouter.post('/', async (req, res) => {
  if (rateLimited(req)) {
    return res
      .status(429)
      .json({ error: 'Too many requests from here. Try again later.' })
  }

  const parsed = createOrderSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }

  // The honeypot is never rendered, so anything in it came from a script.
  // Answered as if it worked: a bot told it failed simply tries again.
  if (parsed.data.website?.trim()) {
    return res.status(201).json({ reference: 'BLT-000000', status: 'new' })
  }

  try {
    const order = await createOrder({
      // A guest files under nobody. A super admin has no company of their own
      // to file this under either, so they land in the same place.
      companyId: req.authUser?.companyId ?? null,
      userId: req.authUser?.id ?? null,
      body: parsed.data,
    })
    res.status(201).json(order)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Could not send the request'
    console.warn('[orders] create failed:', message)
    res.status(500).json({ error: message })
  }
})

ordersRouter.get('/', requireAuth, async (req, res) => {
  const scope = scopeFor(req)
  if (!scope) return res.status(403).json({ error: NO_COMPANY })

  try {
    res.json(await listOrders(scope))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load requests'
    console.warn('[orders] list failed:', message)
    res.status(500).json({ error: message })
  }
})

ordersRouter.get('/:id', requireAuth, async (req, res) => {
  const scope = scopeFor(req)
  if (!scope) return res.status(403).json({ error: NO_COMPANY })

  try {
    const order = await getOrder({ ...scope, orderId: routeParam(req, 'id') })
    // Scoped by company as well as id, so "not yours" and "not there" give the
    // same answer — which is the one we want to give.
    if (!order) return res.status(404).json({ error: 'Request not found' })
    res.json(order)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load the request'
    console.warn('[orders] get failed:', message)
    res.status(500).json({ error: message })
  }
})

ordersRouter.patch('/:id', requireAuth, async (req, res) => {
  const scope = scopeFor(req)
  if (!scope) return res.status(403).json({ error: NO_COMPANY })

  const parsed = updateOrderSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }

  try {
    const order = await setOrderStatus({
      ...scope,
      orderId: routeParam(req, 'id'),
      status: parsed.data.status,
    })
    if (!order) return res.status(404).json({ error: 'Request not found' })
    res.json(order)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not update the request'
    console.warn('[orders] update failed:', message)
    res.status(500).json({ error: message })
  }
})
