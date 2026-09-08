import { Router } from 'express'
import type { ZodError } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
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

/** A request belongs to a company, so it needs an account behind it. */
ordersRouter.use(requireAuth)

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
  const scope = scopeFor(req)
  // A super admin has no company of their own to file this under.
  const companyId = scope?.companyId ?? req.authUser?.companyId
  if (!companyId || !req.authUser) {
    return res.status(403).json({ error: NO_COMPANY })
  }

  const parsed = createOrderSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }

  try {
    const order = await createOrder({
      companyId,
      userId: req.authUser.id,
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

ordersRouter.get('/', async (req, res) => {
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

ordersRouter.get('/:id', async (req, res) => {
  const scope = scopeFor(req)
  if (!scope) return res.status(403).json({ error: NO_COMPANY })

  try {
    const order = await getOrder({ ...scope, orderId: req.params.id })
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

ordersRouter.patch('/:id', async (req, res) => {
  const scope = scopeFor(req)
  if (!scope) return res.status(403).json({ error: NO_COMPANY })

  const parsed = updateOrderSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }

  try {
    const order = await setOrderStatus({
      ...scope,
      orderId: req.params.id,
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
