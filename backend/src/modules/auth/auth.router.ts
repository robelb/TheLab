import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { loginSchema, signupSchema } from './auth.schema.js'
import { AuthError, getMe, login, loginAsDemo, signup } from './auth.service.js'

function firstZodError(error: import('zod').ZodError): string {
  const { fieldErrors, formErrors } = error.flatten()
  const field = Object.values(fieldErrors).flat().find(Boolean)
  return field ?? formErrors[0] ?? 'Invalid request'
}

export const authRouter = Router()

authRouter.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodError(parsed.error) })
  }
  try {
    const result = await signup(parsed.data)
    res.status(201).json(result)
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status).json({ error: err.message })
    }
    console.warn('[auth] signup failed:', err)
    res.status(500).json({ error: 'Signup failed' })
  }
})

authRouter.post('/login', async (req, res) => {
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
