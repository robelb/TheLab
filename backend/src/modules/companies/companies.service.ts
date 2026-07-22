import { and, count, desc, eq, ilike, or } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  companies,
  type Company,
  type CompanyBrand,
} from '../../db/schema/index.js'
import { ROLES, type AuthUser } from '../../lib/roles.js'
import {
  AuthError,
  provisionCompanyBrand,
  toPublicCompany,
  type PublicCompany,
} from '../auth/auth.service.js'
import type {
  CreateCompanyBody,
  ListCompaniesQuery,
  UpdateCompanyBody,
} from './companies.schema.js'

function isSuperAdmin(actor: AuthUser): boolean {
  return actor.role === ROLES.SUPER_ADMIN
}

async function loadCompanyForActor(
  actor: AuthUser,
  id: string,
): Promise<Company> {
  if (!isSuperAdmin(actor) && actor.companyId !== id) {
    throw new AuthError('Forbidden.', 403)
  }
  const [row] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1)
  if (!row) throw new AuthError('Company not found.', 404)
  return row
}

export interface ListCompaniesResult {
  data: PublicCompany[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

export async function listCompanies(
  query: ListCompaniesQuery,
): Promise<ListCompaniesResult> {
  const filters: SQL[] = []
  if (query.q) {
    const like = `%${query.q}%`
    const search = or(ilike(companies.name, like), ilike(companies.domain, like))
    if (search) filters.push(search)
  }
  const where = filters.length ? and(...filters) : undefined
  const offset = (query.page - 1) * query.limit

  const [rows, [countRow]] = await Promise.all([
    db
      .select()
      .from(companies)
      .where(where)
      .orderBy(desc(companies.createdAt))
      .limit(query.limit)
      .offset(offset),
    db.select({ total: count() }).from(companies).where(where),
  ])

  const total = countRow?.total ?? 0
  return {
    data: rows.map(toPublicCompany),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
    },
  }
}

export async function getCompany(
  actor: AuthUser,
  id: string,
): Promise<PublicCompany> {
  return toPublicCompany(await loadCompanyForActor(actor, id))
}

export async function createCompany(
  body: CreateCompanyBody,
): Promise<PublicCompany> {
  const [existing] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.domain, body.domain))
    .limit(1)
  if (existing) {
    throw new AuthError('A company with this domain already exists.', 409)
  }
  const [row] = await db
    .insert(companies)
    .values({ name: body.name, domain: body.domain, brandStatus: 'pending' })
    .returning()
  return toPublicCompany(row)
}

export async function updateCompany(
  actor: AuthUser,
  id: string,
  body: UpdateCompanyBody,
): Promise<PublicCompany> {
  await loadCompanyForActor(actor, id)
  const values: Partial<typeof companies.$inferInsert> = {}
  if (body.name !== undefined) values.name = body.name
  if (body.sourceUrl !== undefined) values.sourceUrl = body.sourceUrl
  const [row] = await db
    .update(companies)
    .set(values)
    .where(eq(companies.id, id))
    .returning()
  return toPublicCompany(row)
}

export async function deleteCompany(id: string): Promise<void> {
  const [row] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1)
  if (!row) throw new AuthError('Company not found.', 404)
  await db.delete(companies).where(eq(companies.id, id))
}

/** Shallow-merge partial brand overrides into the stored brand + bust cache. */
export async function updateCompanyBrand(
  actor: AuthUser,
  id: string,
  brandPartial: Record<string, unknown>,
): Promise<PublicCompany> {
  const company = await loadCompanyForActor(actor, id)
  const merged = {
    ...(company.brand ?? {}),
    ...brandPartial,
  } as CompanyBrand
  const [row] = await db
    .update(companies)
    .set({
      brand: merged,
      brandGeneration: String(Date.now()),
      brandStatus: 'ready',
    })
    .where(eq(companies.id, id))
    .returning()
  return toPublicCompany(row)
}

/** Re-run brand extraction on demand (refreshes theme + branded images). */
export async function reExtractCompany(
  actor: AuthUser,
  id: string,
): Promise<PublicCompany> {
  const company = await loadCompanyForActor(actor, id)
  await db
    .update(companies)
    .set({ brandStatus: 'pending', brandError: null })
    .where(eq(companies.id, id))
  await provisionCompanyBrand(company.id, company.domain)
  const [row] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1)
  return toPublicCompany(row)
}
