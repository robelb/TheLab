/**
 * Single source of truth for roles + the one permission-decision helper.
 *
 * Phase 1 uses coarse capabilities (`manage_all` / `manage_company` /
 * `view_storefront`). Phase 2 will swap the *internals* of `can()` for the full
 * (role × module × level) decision rule with company overrides — but every
 * caller (middleware, routes, and the client mirror) keeps calling `can()`, so
 * the gating surface never has to change.
 */

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  COMPANY_OWNER: 'company_owner',
  MEMBER: 'member',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

export const ALL_ROLES: Role[] = [
  ROLES.SUPER_ADMIN,
  ROLES.COMPANY_OWNER,
  ROLES.MEMBER,
]

/** Roles offered in normal assignment forms — `super_admin` is never assignable. */
export const ASSIGNABLE_ROLES: Role[] = [ROLES.COMPANY_OWNER, ROLES.MEMBER]

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ALL_ROLES as string[]).includes(value)
}

/** The authenticated principal, as carried on the JWT and `req.authUser`. */
export interface AuthUser {
  id: string
  role: Role
  companyId: string | null
}

export type Capability = 'manage_all' | 'manage_company' | 'view_storefront'

/** Optional target context for a capability check (e.g. the company acted on). */
export interface CapabilityContext {
  companyId?: string | null
}

/**
 * The single gating rule. Two bypasses matter and are easy to forget:
 *  - a full `super_admin` is allowed everywhere;
 *  - a `company_owner` is allowed within their own company.
 */
export function can(
  user: AuthUser | null | undefined,
  capability: Capability,
  ctx: CapabilityContext = {},
): boolean {
  if (!user) return false

  // Global administrator bypasses every check.
  if (user.role === ROLES.SUPER_ADMIN) return true

  switch (capability) {
    case 'view_storefront':
      // Any authenticated user can browse the storefront.
      return true

    case 'manage_all':
      // Only the global administrator (handled above).
      return false

    case 'manage_company': {
      if (user.role !== ROLES.COMPANY_OWNER) return false
      if (!user.companyId) return false
      // Owner short-circuit: allowed only within their own company. When no
      // target company is specified, the check is scoped to the owner's company.
      const target = ctx.companyId ?? user.companyId
      return target === user.companyId
    }

    default:
      return false
  }
}
