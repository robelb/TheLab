#!/usr/bin/env node
/**
 * Switch the demo account off: deactivate it and replace its password with a
 * random one nobody knows.
 *
 * The demo login itself is off unless `DEMO_LOGIN_ENABLED=true`, but the
 * account it signs in as is a company owner, and older seeds gave it a known
 * default password — so it could still be used through the normal login.
 * Run this against every database the live shop uses. Idempotent.
 *
 *   pnpm demo:disable
 *
 * Env (optional): DEMO_USER_EMAIL, default demo@biglittlethings.de
 */
import { config } from 'dotenv'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { users } from '../src/db/schema/index.js'
import { hashPassword } from '../src/lib/password.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dirname, '../.env') })

const EMAIL = (process.env.DEMO_USER_EMAIL?.trim() || 'demo@biglittlethings.de').toLowerCase()

async function main() {
  const [user] = await db
    .update(users)
    .set({
      isActive: false,
      passwordHash: await hashPassword(randomBytes(32).toString('base64url')),
    })
    .where(eq(users.email, EMAIL))
    .returning({ id: users.id, email: users.email })

  console.log(
    user
      ? `Demo account ${user.email} deactivated, password replaced.`
      : `No account ${EMAIL} — nothing to do.`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Disabling the demo account failed:', err)
    process.exit(1)
  })
