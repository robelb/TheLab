import type { NextFunction, Request, Response } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { users } from '../db/schema/index.js'
import { verifyAuthToken } from '../lib/jwt.js'
import {
  can,
  isRole,
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

/**
 * Require a valid token, and take the caller's role from the database.
 *
 * The token carries a role, but only the one they had when they signed in.
 * Tokens last a week, so trusting that claim means a promotion does not take
 * effect for a week — and, the way that matters, neither does a demotion: an
 * administrator whose access is revoked keeps it until their token expires.
 *
 * So the claim is used to say *who* is asking, and the row is used to say what
 * they may do. That is one indexed lookup on the routes that need an account,
 * which are the dashboard's; the storefront uses `optionalAuth` and is untouched.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = bearerToken(req)
  const claims = token ? verifyAuthToken(token) : null
  if (!claims) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  try {
    const [row] = await db
      .select({
        id: users.id,
        role: users.role,
        companyId: users.companyId,
      })
      .from(users)
      .where(eq(users.id, claims.id))
      .limit(1)

    // The account was deleted while the token was still valid.
    if (!row || !isRole(row.role)) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    req.authUser = { id: row.id, role: row.role, companyId: row.companyId }
    next()
  } catch (err) {
    console.warn(
      '[auth] could not load the account:',
      err instanceof Error ? err.message : err,
    )
    res.status(503).json({ error: 'Could not verify your account' })
  }
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
