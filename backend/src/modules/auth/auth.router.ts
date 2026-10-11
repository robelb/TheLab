import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { loginLimit } from '../../lib/rateLimit.js'
import { loginSchema } from './auth.schema.js'
import { AuthError, getMe, login, loginAsDemo } from './auth.service.js'

function firstZodError(error: import('zod').ZodError): string {
  const { fieldErrors, formErrors } = error.flatten()
  const field = Object.values(fieldErrors).flat().find(Boolean)
  return field ?? formErrors[0] ?? 'Invalid request'
}

export const authRouter = Router()

/**
 * Accounts are by invitation: a big little things admin, or a company's owner,
 * adds people from the dashboard. Public sign-up made the first person to
 * register a domain that company's owner, with no check they worked there.
 * Shoppers do not need an account — checkout works as a guest.
 */
authRouter.post('/signup', (_req, res) => {
  res.status(403).json({
    error: 'Accounts are by invitation. Ask your company admin or big little things to add you.',
  })
})

authRouter.post('/login', loginLimit, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }
  try {
    const result = await login(parsed.data)
    res.json(result)
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status).json({ error: err.message })
    }
    console.warn('[auth] login failed:', err)
    res.status(500).json({ error: 'Login failed' })
  }
})

authRouter.post('/demo', async (_req, res) => {
  try {
    const result = await loginAsDemo()
    res.json(result)
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status).json({ error: err.message })
    }
    console.warn('[auth] demo login failed:', err)
    res.status(500).json({ error: 'Demo login failed' })
  }
})

authRouter.get('/me', requireAuth, async (req, res) => {
  try {
    const bundle = await getMe(req.authUser!.id)
    res.json(bundle)
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status).json({ error: err.message })
    }
    console.warn('[auth] me failed:', err)
    res.status(500).json({ error: 'Failed to load profile' })
  }
})
