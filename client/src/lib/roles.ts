/**
 * Client mirror of the backend roles + `can()` decision helper
 * (`backend/src/lib/roles.ts`). Keep the two in sync — the same rule gates the
 * UI (routes, nav, write actions) that gates the API.
 */

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  COMPANY_OWNER: 'company_owner',
  MEMBER: 'member',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Administrator',
  company_owner: 'Company Owner',
  member: 'Member',
}

/** Roles offered in assignment forms — `super_admin` is never assignable. */
export const ASSIGNABLE_ROLES: Role[] = [ROLES.COMPANY_OWNER, ROLES.MEMBER]

export type Capability = 'manage_all' | 'manage_company' | 'view_storefront'

export interface Principal {
  role: Role
  companyId: string | null
}

export interface CapabilityContext {
  companyId?: string | null
}

export function can(
  user: Principal | null | undefined,
  capability: Capability,
  ctx: CapabilityContext = {},
): boolean {
  if (!user) return false
  if (user.role === ROLES.SUPER_ADMIN) return true

  switch (capability) {
    case 'view_storefront':
      return true
    case 'manage_all':
      return false
    case 'manage_company': {
      if (user.role !== ROLES.COMPANY_OWNER) return false
      if (!user.companyId) return false
      const target = ctx.companyId ?? user.companyId
      return target === user.companyId
    }
    default:
      return false
  }
}
