import { clientMessage } from '../../lib/clientError.js'
import { Router } from 'express'
import { orderLimit } from '../../lib/rateLimit.js'
import { routeParam } from '../../lib/routeParam.js'
import type { ZodError } from 'zod'
import type { Request, Response } from 'express'
import {
  optionalAuth,
  requireAuth,
  requireCapability,
} from '../../middleware/auth.js'
import { ROLES } from '../../lib/roles.js'
import {
  confirmOrderSchema,
  createOrderSchema,
  orderDetailsSchema,
  checkoutProblems,
  guestProblems,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  resendEmailSchema,
  updateOrderSchema,
} from './orders.schema.js'
import {
  confirmOrder,
  createOrder,
  getOrder,
  listOrderEmails,
  listOrders,
  OrderError,
  resendOrderEmail,
  updateOrder,
  updateOrderDetails,
  type OrderFilters,
} from './orders.service.js'
import { getInvoiceByOrder } from './invoices.service.js'
import { renderInvoicePdf } from '../../services/invoicePdf.js'

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

/**
 * Requests carry customers' names, emails, phone numbers and addresses, so
 * reading or changing them is for a company's owners and for big little
 * things' admins — not for every member of the company.
 */
const companyAdmin = requireCapability('manage_company')

/** Known refusals keep their status; anything else is a 500. */
function fail(res: Response, err: unknown, fallback: string, what: string) {
  if (err instanceof OrderError) {
    return res.status(err.status).json({ error: err.message, code: err.code })
  }
  return res
    .status(500)
    .json({ error: clientMessage(err, fallback, { log: `orders ${what} failed` }) })
}

function queryString(req: Request, key: string): string | undefined {
  const value = req.query[key]
  return typeof value === 'string' && value ? value : undefined
}

function filtersFrom(req: Request): OrderFilters {
  const source = queryString(req, 'source')
  const status = queryString(req, 'status')
  const paymentStatus = queryString(req, 'paymentStatus')
  const collectionId = queryString(req, 'collectionId')
  return {
    source: source === 'storefront' || source === 'funnel' ? source : undefined,
    status: (ORDER_STATUSES as readonly string[]).includes(status ?? '')
      ? (status as OrderFilters['status'])
      : undefined,
    paymentStatus: (PAYMENT_STATUSES as readonly string[]).includes(paymentStatus ?? '')
      ? (paymentStatus as OrderFilters['paymentStatus'])
      : undefined,
    collectionId:
      collectionId && /^[0-9a-f-]{36}$/i.test(collectionId) ? collectionId : undefined,
  }
}

// Throttled per visitor (per account when signed in): the one anonymous write.
ordersRouter.post('/', orderLimit, async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }

  // The honeypot is never rendered, so anything in it came from a script.
  // Answered as if it worked: a bot told it failed simply tries again.
  if (parsed.data.website?.trim()) {
    return res.status(201).json({ reference: 'BLT-000000', status: 'new' })
  }

  // A signed-in shopper's details live on their account; a guest's live only
  // on this request, so everything an invoice needs has to be on it.
  if (!req.authUser) {
    const problem = guestProblems(parsed.data)
    if (problem) return res.status(400).json({ error: problem })
  }
  const problem = checkoutProblems(parsed.data)
  if (problem) return res.status(400).json({ error: problem })

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
    fail(res, err, 'Could not send the request', 'create')
  }
})

ordersRouter.get('/', requireAuth, companyAdmin, async (req, res) => {
  const scope = scopeFor(req)
  if (!scope) return res.status(403).json({ error: NO_COMPANY })

  try {
    res.json(await listOrders({ ...scope, filters: filtersFrom(req) }))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load requests'
    console.warn('[orders] list failed:', message)
    res.status(500).json({ error: clientMessage(err, 'Could not load requests') })
  }
})

ordersRouter.get('/:id', requireAuth, companyAdmin, async (req, res) => {
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
    res.status(500).json({ error: clientMessage(err, 'Could not load the request') })
  }
})

ordersRouter.patch('/:id', requireAuth, companyAdmin, async (req, res) => {
  const scope = scopeFor(req)
  if (!scope) return res.status(403).json({ error: NO_COMPANY })

  const parsed = updateOrderSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }
  // Money is a super admin's call: a company can withdraw its own request,
  // but only we mark an invoice paid.
  if (parsed.data.paymentStatus && req.authUser?.role !== ROLES.SUPER_ADMIN) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  try {
    const order = await updateOrder({
      ...scope,
      orderId: routeParam(req, 'id'),
      status: parsed.data.status,
      paymentStatus: parsed.data.paymentStatus,
      asAdmin: req.authUser?.role === ROLES.SUPER_ADMIN,
    })
    if (!order) return res.status(404).json({ error: 'Request not found' })
    res.json(order)
  } catch (err) {
    fail(res, err, 'Could not update the request', 'update')
  }
})

/**
 * Confirm a request: agree its final price, issue the invoice, email it.
 * Super admins only — this is the point an order becomes something owed.
 */
ordersRouter.post(
  '/:id/confirm',
  requireAuth,
  requireCapability('manage_all'),
  async (req, res) => {
    const parsed = confirmOrderSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) })
    }
    try {
      const order = await confirmOrder({
        orderId: routeParam(req, 'id'),
        confirmedBy: req.authUser!.id,
        body: parsed.data,
      })
      if (!order) return res.status(404).json({ error: 'Request not found' })
      res.json(order)
    } catch (err) {
      fail(res, err, 'Could not confirm the order', 'confirm')
    }
  },
)

/**
 * Fill in what the customer sends after the request — a PO number, a
 * corrected invoice address, "the addresses have arrived", the sticker logo.
 * Super admins only, and only until the order is confirmed.
 */
ordersRouter.patch(
  '/:id/details',
  requireAuth,
  requireCapability('manage_all'),
  async (req, res) => {
    const parsed = orderDetailsSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) })
    }
    try {
      const order = await updateOrderDetails({
        orderId: routeParam(req, 'id'),
        body: parsed.data,
      })
      if (!order) return res.status(404).json({ error: 'Request not found' })
      res.json(order)
    } catch (err) {
      fail(res, err, 'Could not update the request', 'details')
    }
  },
)

/** The invoice as a PDF, rendered from what was issued. */
ordersRouter.get(
  '/:id/invoice.pdf',
  requireAuth,
  requireCapability('manage_all'),
  async (req, res) => {
    try {
      const invoice = await getInvoiceByOrder(routeParam(req, 'id'))
      if (!invoice) return res.status(404).json({ error: 'No invoice for this order' })
      const pdf = await renderInvoicePdf(invoice)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${invoice.number}.pdf"`,
      )
      res.send(pdf)
    } catch (err) {
      fail(res, err, 'Could not render the invoice', 'invoice')
    }
  },
)

/** Send a customer email again. */
ordersRouter.post(
  '/:id/resend-email',
  requireAuth,
  requireCapability('manage_all'),
  async (req, res) => {
    const parsed = resendEmailSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) })
    }
    try {
      const found = await resendOrderEmail({
        orderId: routeParam(req, 'id'),
        template: parsed.data.template,
      })
      if (!found) return res.status(404).json({ error: 'Request not found' })
      if (found.status === 'failed') {
        return res.status(502).json({
          error: `The email could not be sent: ${found.error}${found.willRetry ? ' We will retry automatically.' : ''}`,
          code: 'email_failed',
          delivery: found,
        })
      }
      // `queued`: sending is not configured here, so it waits in the queue.
      res.status(found.status === 'sent' ? 200 : 202).json(found)
    } catch (err) {
      fail(res, err, 'Could not send the email', 'resend-email')
    }
  },
)

/** The emails an order has queued, and whether each went out. */
ordersRouter.get(
  '/:id/emails',
  requireAuth,
  requireCapability('manage_all'),
  async (req, res) => {
    try {
      res.json(await listOrderEmails(routeParam(req, 'id')))
    } catch (err) {
      fail(res, err, 'Could not load the emails', 'emails')
    }
  },
)
