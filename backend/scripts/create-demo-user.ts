#!/usr/bin/env node
/**
 * Seed (or refresh) the public demo account used by "Continue with the BLT demo".
 *
 * Creates a `company_owner` (company administrator) user inside the demo company
 * so the demo login (`POST /api/auth/demo`) can sign a token for it — the shop
 * then loads that company's brand + branded product images through the normal
 * authenticated path. Idempotent: re-running updates the existing demo user.
 *
 * Env (optional):
 *   DEMO_USER_EMAIL       default demo@biglittlethings.de
 *   DEMO_COMPANY_DOMAIN   default biglittlethings.de
 *   DEMO_USER_PASSWORD    default a random-ish constant (login is passwordless)
 *
 * Usage: pnpm demo:user
 */
import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { companies, users } from '../src/db/schema/index.js'
import { hashPassword } from '../src/lib/password.js'
import { ROLES } from '../src/lib/roles.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dirname, '../.env') })

const EMAIL = (process.env.DEMO_USER_EMAIL?.trim() || 'demo@biglittlethings.de').toLowerCase()
const DOMAIN = process.env.DEMO_COMPANY_DOMAIN?.trim() || 'biglittlethings.de'
const PASSWORD = process.env.DEMO_USER_PASSWORD?.trim() || 'blt-demo-passwordless'

async function main() {
  const [company] = await db
    .select({ id: companies.id, name: companies.name, domain: companies.domain })
    .from(companies)
    .where(eq(companies.domain, DOMAIN))
    .limit(1)

  if (!company) {
    console.error(
      `Demo company "${DOMAIN}" not found. Create it first (sign up with a ${DOMAIN} email or run onboarding), then re-run.`,
    )
    process.exit(1)
  }

  const passwordHash = await hashPassword(PASSWORD)
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, EMAIL))
    .limit(1)

  if (existing) {
    await db
      .update(users)
      .set({
        role: ROLES.COMPANY_OWNER,
        companyId: company.id,
        emailDomain: DOMAIN,
        isActive: true,
      })
      .where(eq(users.id, existing.id))
    console.log(`Updated demo user ${EMAIL} → company_owner of ${company.name} (${company.domain}).`)
  } else {
    await db.insert(users).values({
      name: 'Demo User',
      email: EMAIL,
      passwordHash,
      role: ROLES.COMPANY_OWNER,
      companyId: company.id,
      emailDomain: DOMAIN,
      isActive: true,
    })
    console.log(`Created demo user ${EMAIL} → company_owner of ${company.name} (${company.domain}).`)
  }

  console.log('The "Continue with the BLT demo" button will now log in as this user.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Demo user seed failed:', err)
    process.exit(1)
  })
