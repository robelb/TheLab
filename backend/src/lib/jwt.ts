import jwt, { type SignOptions } from 'jsonwebtoken'
import { env } from '../config/env.js'
import { isRole, type AuthUser } from './roles.js'

interface TokenClaims {
  sub: string
  role: string
  companyId: string | null
}

export function signAuthToken(user: AuthUser): string {
  const claims: TokenClaims = {
    sub: user.id,
    role: user.role,
    companyId: user.companyId,
  }
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  }
  return jwt.sign(claims, env.JWT_SECRET, options)
}

/** Verify a bearer token and return the principal, or null if invalid. */
export function verifyAuthToken(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET)
    if (typeof decoded !== 'object' || decoded === null) return null
    const { sub, role, companyId } = decoded as Record<string, unknown>
    if (typeof sub !== 'string' || !isRole(role)) return null
    return {
      id: sub,
      role,
      companyId: typeof companyId === 'string' ? companyId : null,
    }
  } catch {
    return null
  }
}
