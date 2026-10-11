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

/**
 * The account a token speaks for, as it is now.
 *
 * The token carries a role and a company, but only the ones it was signed
 * with. Tokens last a week, so trusting those claims means a demotion, a move
 * to another company or a deactivation does not take effect for a week. The
 * claim is used to say *who* is asking; the row says what they may do. Null
 * for an account that was deleted or deactivated since.
 */
async function currentPrincipal(id: string): Promise<AuthUser | null> {
  const [row] = await db
    .select({
      id: users.id,
      role: users.role,
      companyId: users.companyId,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1)
  if (!row || !row.isActive || !isRole(row.role)) return null
  return { id: row.id, role: row.role, companyId: row.companyId }
}

/**
 * Attach `req.authUser` when a valid token belongs to an active account;
 * never blocks. The storefront routes use this, and several of them act on
 * the caller's role or company — so those come from the account, not the
 * token, exactly as in `requireAuth`. A lookup that fails leaves the visitor
 * a guest rather than taking the shop down.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = bearerToken(req)
  const claims = token ? verifyAuthToken(token) : null
  if (claims) {
    try {
      const user = await currentPrincipal(claims.id)
      if (user) req.authUser = user
    } catch (err) {
      console.warn(
        '[auth] could not load the account, continuing as guest:',
        err instanceof Error ? err.message : err,
      )
    }
  }
  next()
}

/**
 * Require a valid token for an active account, with its role and company
 * taken from the database — see `currentPrincipal`. One indexed lookup.
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
    const user = await currentPrincipal(claims.id)
    // Deleted or deactivated while the token was still valid.
    if (!user) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    req.authUser = user
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
