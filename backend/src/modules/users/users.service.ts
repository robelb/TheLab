import { and, count, desc, eq, ilike, or } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { users, type User } from '../../db/schema/index.js'
import { emailDomainOf, normalizeEmail } from '../../lib/email.js'
import { hashPassword } from '../../lib/password.js'
import { ROLES, type AuthUser, type Role } from '../../lib/roles.js'
import { AuthError, toPublicUser, type PublicUser } from '../auth/auth.service.js'
import type {
  CreateUserBody,
  ListUsersQuery,
  UpdateUserBody,
} from './users.schema.js'

function isSuperAdmin(actor: AuthUser): boolean {
  return actor.role === ROLES.SUPER_ADMIN
}

/**
 * Fetch a user the actor is allowed to manage. Super-admins manage everyone;
 * company owners manage only users within their own company (and never a
 * super-admin).
 */
async function loadManageableUser(
  actor: AuthUser,
  id: string,
): Promise<User> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!user) throw new AuthError('User not found.', 404)
  if (!isSuperAdmin(actor)) {
    if (user.companyId !== actor.companyId) {
      throw new AuthError('Forbidden.', 403)
    }
    if (user.role === ROLES.SUPER_ADMIN) {
      throw new AuthError('Forbidden.', 403)
    }
  }
  return user
}

export interface ListUsersResult {
  data: PublicUser[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export async function listUsers(
  actor: AuthUser,
  query: ListUsersQuery,
): Promise<ListUsersResult> {
  const filters: SQL[] = []

  // Company owners are always scoped to their own company; super-admins may
  // optionally filter by a specific company.
  if (isSuperAdmin(actor)) {
    if (query.companyId) filters.push(eq(users.companyId, query.companyId))
  } else {
    if (!actor.companyId) {
      return {
        data: [],
        pagination: { page: query.page, limit: query.limit, total: 0, totalPages: 0 },
      }
    }
    filters.push(eq(users.companyId, actor.companyId))
  }

  if (query.q) {
    const like = `%${query.q}%`
    const search = or(ilike(users.name, like), ilike(users.email, like))
    if (search) filters.push(search)
  }

  const where = filters.length ? and(...filters) : undefined
  const offset = (query.page - 1) * query.limit

  const [rows, [countRow]] = await Promise.all([
    db
      .select()
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(query.limit)
      .offset(offset),
    db.select({ total: count() }).from(users).where(where),
  ])

  const total = countRow?.total ?? 0
  return {
    data: rows.map(toPublicUser),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
    },
  }
}

export async function getUser(
  actor: AuthUser,
  id: string,
): Promise<PublicUser> {
  const user = await loadManageableUser(actor, id)
  return toPublicUser(user)
}

async function assertEmailAvailable(email: string, excludeId?: string) {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  if (existing && existing.id !== excludeId) {
    throw new AuthError('An account with this email already exists.', 409)
  }
}

export async function createUser(
  actor: AuthUser,
  body: CreateUserBody,
): Promise<PublicUser> {
  const email = normalizeEmail(body.email)
  await assertEmailAvailable(email)

  // Super-admins choose the company; owners can only create within their own.
  const companyId = isSuperAdmin(actor)
    ? (body.companyId ?? null)
    : actor.companyId
  if (!isSuperAdmin(actor) && !companyId) {
    throw new AuthError('You are not attached to a company.', 403)
  }

  const role = (body.role as Role | undefined) ?? ROLES.MEMBER
  const passwordHash = await hashPassword(body.password)

  const [user] = await db
    .insert(users)
    .values({
      name: body.name,
      email,
      passwordHash,
      role,
      companyId,
      emailDomain: emailDomainOf(email),
    })
    .returning()

  return toPublicUser(user)
}

export async function updateUser(
  actor: AuthUser,
  id: string,
  body: UpdateUserBody,
): Promise<PublicUser> {
  await loadManageableUser(actor, id)

  const values: Partial<typeof users.$inferInsert> = {}
  if (body.name !== undefined) values.name = body.name
  if (body.email !== undefined) {
    const email = normalizeEmail(body.email)
    await assertEmailAvailable(email, id)
    values.email = email
    values.emailDomain = emailDomainOf(email)
  }

  const [user] = await db
    .update(users)
    .set(values)
    .where(eq(users.id, id))
    .returning()
  return toPublicUser(user)
}

export async function deleteUser(
  actor: AuthUser,
  id: string,
): Promise<void> {
  await loadManageableUser(actor, id)
  if (id === actor.id) {
    throw new AuthError('You cannot delete your own account.', 400)
  }
  await db.delete(users).where(eq(users.id, id))
}

export async function changeUserRole(
  actor: AuthUser,
  id: string,
  role: Role,
): Promise<PublicUser> {
  await loadManageableUser(actor, id)
  const [user] = await db
    .update(users)
    .set({ role })
    .where(eq(users.id, id))
    .returning()
  return toPublicUser(user)
}

export async function changeUserCompany(
  actor: AuthUser,
  id: string,
  companyId: string | null,
): Promise<PublicUser> {
  // Moving a user between companies is a super-admin-only action.
  if (!isSuperAdmin(actor)) throw new AuthError('Forbidden.', 403)
  await loadManageableUser(actor, id)
  const [user] = await db
    .update(users)
    .set({ companyId })
    .where(eq(users.id, id))
    .returning()
  return toPublicUser(user)
}

export async function setUserActive(
  actor: AuthUser,
  id: string,
  isActive: boolean,
): Promise<PublicUser> {
  await loadManageableUser(actor, id)
  const [user] = await db
    .update(users)
    .set({ isActive })
    .where(eq(users.id, id))
    .returning()
  return toPublicUser(user)
}

export async function setUserEmailVerification(
  actor: AuthUser,
  id: string,
  emailVerified: boolean,
): Promise<PublicUser> {
  await loadManageableUser(actor, id)
  const [user] = await db
    .update(users)
    .set({ emailVerified })
    .where(eq(users.id, id))
    .returning()
  return toPublicUser(user)
}

export async function adminResetPassword(
  actor: AuthUser,
  id: string,
  password: string,
): Promise<void> {
  await loadManageableUser(actor, id)
  const passwordHash = await hashPassword(password)
  await db.update(users).set({ passwordHash }).where(eq(users.id, id))
}
