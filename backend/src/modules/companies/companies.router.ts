import { Router, type Request, type Response } from 'express'
import { requireAuth, requireCapability } from '../../middleware/auth.js'
import type { Role } from '../../lib/roles.js'
import { AuthError } from '../auth/auth.service.js'
import {
  changeRoleSchema,
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
} from '../users/users.schema.js'
import {
  changeUserRole,
  createUser,
  listUsers,
  updateUser,
} from '../users/users.service.js'
import {
  createCompanySchema,
  listCompaniesQuerySchema,
  updateBrandSchema,
  updateCompanySchema,
} from './companies.schema.js'
import {
  createCompany,
  deleteCompany,
  getCompany,
  listCompanies,
  reExtractCompany,
  updateCompany,
  updateCompanyBrand,
} from './companies.service.js'

function firstZodError(error: import('zod').ZodError): string {
  const { fieldErrors, formErrors } = error.flatten()
  const field = Object.values(fieldErrors).flat().find(Boolean)
  return field ?? formErrors[0] ?? 'Invalid request'
}

function sendError(res: Response, err: unknown, fallback: string): void {
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  console.warn(`[companies] ${fallback}:`, err)
  res.status(500).json({ error: fallback })
}

// Express 5 route params can be typed `string | string[]`; coerce to string.
const idOf = (req: Request) => String((req.params as Record<string, string>).id)
const userIdOf = (req: Request) =>
  String((req.params as Record<string, string>).userId)
const ownCompany = (req: Request) => ({ companyId: idOf(req) })

export const companiesRouter = Router()

companiesRouter.use(requireAuth)

// --- Global (super-admin) company management -------------------------------

companiesRouter.get('/', requireCapability('manage_all'), async (req, res) => {
  const parsed = listCompaniesQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }
  try {
    res.json(await listCompanies(parsed.data))
  } catch (err) {
    sendError(res, err, 'Failed to list companies')
  }
})

companiesRouter.post('/', requireCapability('manage_all'), async (req, res) => {
  const parsed = createCompanySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }
  try {
    res.status(201).json(await createCompany(parsed.data))
  } catch (err) {
    sendError(res, err, 'Failed to create company')
  }
})

companiesRouter.delete(
  '/:id',
  requireCapability('manage_all'),
  async (req, res) => {
    try {
      await deleteCompany(idOf(req))
      res.status(204).end()
    } catch (err) {
      sendError(res, err, 'Failed to delete company')
    }
  },
)

// --- Company detail (super-admin or the company's own owner) ---------------

companiesRouter.get(
  '/:id',
  requireCapability('manage_company', ownCompany),
  async (req, res) => {
    try {
      res.json(await getCompany(req.authUser!, idOf(req)))
    } catch (err) {
      sendError(res, err, 'Failed to load company')
    }
  },
)

companiesRouter.put(
  '/:id',
  requireCapability('manage_company', ownCompany),
  async (req, res) => {
    const parsed = updateCompanySchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) })
    }
    try {
      res.json(await updateCompany(req.authUser!, idOf(req), parsed.data))
    } catch (err) {
      sendError(res, err, 'Failed to update company')
    }
  },
)

companiesRouter.patch(
  '/:id/brand',
  requireCapability('manage_company', ownCompany),
  async (req, res) => {
    const parsed = updateBrandSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) })
    }
    try {
      res.json(
        await updateCompanyBrand(req.authUser!, idOf(req), parsed.data.brand),
      )
    } catch (err) {
      sendError(res, err, 'Failed to update branding')
    }
  },
)

companiesRouter.post(
  '/:id/re-extract',
  requireCapability('manage_company', ownCompany),
  async (req, res) => {
    try {
      res.json(await reExtractCompany(req.authUser!, idOf(req)))
    } catch (err) {
      sendError(res, err, 'Failed to re-extract branding')
    }
  },
)

// --- Company employees (delegates to the users service, scoped to company) --

companiesRouter.get(
  '/:id/users',
  requireCapability('manage_company', ownCompany),
  async (req, res) => {
    const parsed = listUsersQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) })
    }
    try {
      res.json(
        await listUsers(req.authUser!, {
          ...parsed.data,
          companyId: idOf(req),
        }),
      )
    } catch (err) {
      sendError(res, err, 'Failed to list employees')
    }
  },
)

companiesRouter.post(
  '/:id/users',
  requireCapability('manage_company', ownCompany),
  async (req, res) => {
    const parsed = createUserSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) })
    }
    try {
      res.status(201).json(
        await createUser(req.authUser!, {
          ...parsed.data,
          companyId: idOf(req),
        }),
      )
    } catch (err) {
      sendError(res, err, 'Failed to add employee')
    }
  },
)

companiesRouter.patch(
  '/:id/users/:userId/role',
  requireCapability('manage_company', ownCompany),
  async (req, res) => {
    const parsed = changeRoleSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) })
    }
    try {
      res.json(
        await changeUserRole(
          req.authUser!,
          userIdOf(req),
          parsed.data.role as Role,
        ),
      )
    } catch (err) {
      sendError(res, err, 'Failed to change employee role')
    }
  },
)

companiesRouter.put(
  '/:id/users/:userId',
  requireCapability('manage_company', ownCompany),
  async (req, res) => {
    const parsed = updateUserSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) })
    }
    try {
      res.json(await updateUser(req.authUser!, userIdOf(req), parsed.data))
    } catch (err) {
      sendError(res, err, 'Failed to update employee')
    }
  },
)
