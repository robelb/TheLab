import { eq } from 'drizzle-orm'
import { customizeFeaturedImages } from '../../customizer/analyzeWithCustomization.js'
import { analyze } from '../../extractor/analyze.js'
import { db } from '../../db/index.js'
import { env } from '../../config/env.js'
import {
  companies,
  users,
  type Company,
  type CompanyBrandStatus,
  type User,
} from '../../db/schema/index.js'
import { resolveLlmConfig } from '../../extractor/llmConfig.js'
import { normalizeEmail } from '../../lib/email.js'
import { signAuthToken } from '../../lib/jwt.js'
import { verifyPassword } from '../../lib/password.js'
import type { AuthUser, Role } from '../../lib/roles.js'
import type { LoginBody } from './auth.schema.js'

/** Error carrying an HTTP status so the router can respond appropriately. */
export class AuthError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export interface PublicUser {
  id: string
  name: string
  email: string
  role: Role
  companyId: string | null
  emailDomain: string | null
  emailVerified: boolean
  isActive: boolean
  isGhost: boolean
  createdAt: Date
  updatedAt: Date
}

export interface PublicCompany {
  id: string
  name: string
  domain: string
  sourceUrl: string | null
  ownerUserId: string | null
  brand: Company['brand']
  brandGeneration: string | null
  brandStatus: CompanyBrandStatus
  brandError: string | null
  imagesStatus: CompanyBrandStatus
  imagesError: string | null
  createdAt: Date
}

export interface AuthBundle {
  user: PublicUser
  company: PublicCompany | null
  // Populated in Phase 2 (full permission matrix). Empty for now so the client
  // can already read the shape.
  permissions: { defaults: unknown[]; companyOverrides: unknown[] }
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as Role,
    companyId: user.companyId,
    emailDomain: user.emailDomain,
    emailVerified: user.emailVerified,
    isActive: user.isActive,
    isGhost: user.isGhost,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

export function toPublicCompany(company: Company): PublicCompany {
  return {
    id: company.id,
    name: company.name,
    domain: company.domain,
    sourceUrl: company.sourceUrl,
    ownerUserId: company.ownerUserId,
    brand: company.brand,
    brandGeneration: company.brandGeneration,
    brandStatus: company.brandStatus,
    brandError: company.brandError,
    imagesStatus: company.imagesStatus,
    imagesError: company.imagesError,
    createdAt: company.createdAt,
  }
}

export function principalOf(user: User): AuthUser {
  return { id: user.id, role: user.role as Role, companyId: user.companyId }
}

export async function buildAuthBundle(user: User): Promise<AuthBundle> {
  let company: PublicCompany | null = null
  if (user.companyId) {
    const [row] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)
    company = row ? toPublicCompany(row) : null
  }
  return {
    user: toPublicUser(user),
    company,
    permissions: { defaults: [], companyOverrides: [] },
  }
}

/**
 * Extract the domain's brand ONCE and persist it on the company.
 *
 * Two phases with different blocking behavior (by design):
 *  1. Theme extraction (colors/fonts/logo) is AWAITED so the shop is themed
 *     immediately — this is the part the caller blocks on.
 *  2. Featured-product image generation (the slow part) is kicked off in the
 *     BACKGROUND; the company's `imagesStatus` flips to ready/failed when done
 *     and the client polls for it.
 *
 * Best-effort throughout: a branding failure never blocks onboarding.
 */
export async function provisionCompanyBrand(
  companyId: string,
  domain: string,
): Promise<void> {
  const llm = resolveLlmConfig()
  if (!llm) {
    await db
      .update(companies)
      .set({
        brandStatus: 'skipped',
        imagesStatus: 'skipped',
        brandError: 'LLM not configured.',
      })
      .where(eq(companies.id, companyId))
    return
  }

  // --- Phase 1: theme extraction (blocking) ---
  let extraction
  try {
    extraction = await analyze(domain, llm)
  } catch (err) {
    await db
      .update(companies)
      .set({
        brandStatus: 'failed',
        imagesStatus: 'skipped',
        brandError:
          err instanceof Error ? err.message : 'Brand extraction failed.',
      })
      .where(eq(companies.id, companyId))
    return
  }

  const generation = String(Date.now())
  await db
    .update(companies)
    .set({
      brand: extraction,
      brandStatus: 'ready',
      brandError: null,
      brandGeneration: generation,
      imagesStatus: 'pending',
      sourceUrl: extraction.sourceUrl ?? null,
      ...(extraction.companyName ? { name: extraction.companyName } : {}),
    })
    .where(eq(companies.id, companyId))

  // --- Phase 2: featured-product images (background) ---
  void customizeFeaturedImages(extraction, companyId, domain)
    .then((result) =>
      db
        .update(companies)
        .set({
          imagesStatus: result.status,
          imagesError: result.status === 'ready' ? null : (result.message ?? null),
          ...(result.generation
            ? { brandGeneration: String(result.generation) }
            : {}),
        })
        .where(eq(companies.id, companyId)),
    )
    .catch((err) =>
      db
        .update(companies)
        .set({
          imagesStatus: 'failed',
          imagesError:
            err instanceof Error ? err.message : 'Image generation failed.',
        })
        .where(eq(companies.id, companyId)),
    )
}

export interface AuthResult extends AuthBundle {
  token: string
}

export async function login(body: LoginBody): Promise<AuthResult> {
  const email = normalizeEmail(body.email)
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (!user) throw new AuthError('Invalid email or password.', 401)
  const ok = await verifyPassword(body.password, user.passwordHash)
  if (!ok) throw new AuthError('Invalid email or password.', 401)
  if (!user.isActive) {
    throw new AuthError('This account has been deactivated.', 403)
  }

  const token = signAuthToken(principalOf(user))
  return { token, ...(await buildAuthBundle(user)) }
}

export async function getMe(userId: string): Promise<AuthBundle> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!user) throw new AuthError('User not found.', 404)
  return buildAuthBundle(user)
}

/** Email of the public demo account (seed with `pnpm demo:user`). */
export const DEMO_USER_EMAIL =
  process.env.DEMO_USER_EMAIL?.trim().toLowerCase() || 'demo@biglittlethings.de'

/**
 * Passwordless login for the "BLT demo" account. Signs a token for the
 * pre-seeded demo user so the shop loads that company's brand + branded product
 * images through the normal authenticated path.
 *
 * Off unless `DEMO_LOGIN_ENABLED=true`: it hands whoever asks a company
 * owner's session with no password, so the live shop must not offer it. Off,
 * it answers like a route that does not exist.
 */
export async function loginAsDemo(): Promise<AuthResult> {
  if (!env.DEMO_LOGIN_ENABLED) throw new AuthError('Not found.', 404)

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, DEMO_USER_EMAIL))
    .limit(1)

  if (!user) throw new AuthError('Not found.', 404)
  if (!user.isActive) throw new AuthError('Demo account is deactivated.', 403)

  const token = signAuthToken(principalOf(user))
  return { token, ...(await buildAuthBundle(user)) }
}
