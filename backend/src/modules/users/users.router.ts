import { Router, type Response } from 'express'
import { requireAuth, requireCapability } from '../../middleware/auth.js'
import { AuthError } from '../auth/auth.service.js'
import type { Role } from '../../lib/roles.js'
import {
  activateSchema,
  changeCompanySchema,
  changeRoleSchema,
  createUserSchema,
  emailVerificationSchema,
  listUsersQuerySchema,
  passwordResetSchema,
  updateUserSchema,
} from './users.schema.js'
import {
  adminResetPassword,
  changeUserCompany,
  changeUserRole,
  createUser,
  deleteUser,
  getUser,
  listUsers,
  setUserActive,
  setUserEmailVerification,
  updateUser,
} from './users.service.js'

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
  console.warn(`[users] ${fallback}:`, err)
  res.status(500).json({ error: fallback })
}

export const usersRouter = Router()

// The whole users area is owner/super-admin only.
usersRouter.use(requireAuth, requireCapability('manage_company'))

usersRouter.get('/', async (req, res) => {
  const parsed = listUsersQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }
  try {
    res.json(await listUsers(req.authUser!, parsed.data))
  } catch (err) {
    sendError(res, err, 'Failed to list users')
  }
})

usersRouter.post('/', async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }
  try {
    res.status(201).json(await createUser(req.authUser!, parsed.data))
  } catch (err) {
    sendError(res, err, 'Failed to create user')
  }
})

usersRouter.get('/:id', async (req, res) => {
  try {
    res.json(await getUser(req.authUser!, req.params.id))
  } catch (err) {
    sendError(res, err, 'Failed to load user')
  }
})

usersRouter.put('/:id', async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }
  try {
    res.json(await updateUser(req.authUser!, req.params.id, parsed.data))
  } catch (err) {
    sendError(res, err, 'Failed to update user')
  }
})

usersRouter.delete('/:id', async (req, res) => {
  try {
    await deleteUser(req.authUser!, req.params.id)
    res.status(204).end()
  } catch (err) {
    sendError(res, err, 'Failed to delete user')
  }
})

usersRouter.patch('/:id/role', async (req, res) => {
  const parsed = changeRoleSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }
  try {
    res.json(
      await changeUserRole(req.authUser!, req.params.id, parsed.data.role as Role),
    )
  } catch (err) {
    sendError(res, err, 'Failed to change role')
  }
})

usersRouter.patch('/:id/company', async (req, res) => {
  const parsed = changeCompanySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }
  try {
    res.json(
      await changeUserCompany(req.authUser!, req.params.id, parsed.data.companyId),
    )
  } catch (err) {
    sendError(res, err, 'Failed to change company')
  }
})

usersRouter.patch('/:id/activate', async (req, res) => {
  const parsed = activateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }
  try {
    res.json(
      await setUserActive(req.authUser!, req.params.id, parsed.data.isActive),
    )
  } catch (err) {
    sendError(res, err, 'Failed to update status')
  }
})

usersRouter.patch('/:id/email-verification', async (req, res) => {
  const parsed = emailVerificationSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }
  try {
    res.json(
      await setUserEmailVerification(
        req.authUser!,
        req.params.id,
        parsed.data.emailVerified,
      ),
    )
  } catch (err) {
    sendError(res, err, 'Failed to update verification')
  }
})

usersRouter.patch('/:id/password-reset-admin', async (req, res) => {
  const parsed = passwordResetSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }
  try {
    await adminResetPassword(req.authUser!, req.params.id, parsed.data.password)
    res.status(204).end()
  } catch (err) {
    sendError(res, err, 'Failed to reset password')
  }
})
