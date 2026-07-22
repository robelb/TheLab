import type { NextFunction, Request, Response } from 'express'
import { verifyAuthToken } from '../lib/jwt.js'
import {
  can,
  type AuthUser,
  type Capability,
  type CapabilityContext,
} from '../lib/roles.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: AuthUser
    }
  }
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization
  if (!header) return null
  const [scheme, token] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null
  return token.trim()
}

/** Attach `req.authUser` when a valid token is present; never blocks. */
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const token = bearerToken(req)
  if (token) {
    const user = verifyAuthToken(token)
    if (user) req.authUser = user
  }
  next()
}

/** Require a valid token; 401 otherwise. */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = bearerToken(req)
  const user = token ? verifyAuthToken(token) : null
  if (!user) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }
  req.authUser = user
  next()
}

/**
 * Require a capability. Runs after `requireAuth`. `ctx` may derive the target
 * company from the request (e.g. `req.params.id`) so owner scoping applies.
 */
export function requireCapability(
  capability: Capability,
  ctx?: (req: Request) => CapabilityContext,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    if (!can(req.authUser, capability, ctx?.(req) ?? {})) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    next()
  }
}
