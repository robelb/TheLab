import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { appSettings, companies } from '../../db/schema/index.js'

const HOUSE_THEME_KEY = 'house_theme'

/**
 * A theme as a version and the brand it stands for.
 *
 * The version is a hash of the brand itself, so it changes exactly when the
 * theme does — a save that changes nothing leaves every open shop alone, and
 * no clock or counter has to be kept in step with the data.
 */
export interface VersionedTheme<T> {
  version: string
  brand: T
}

export interface ThemeBundle {
  /**
   * The big little things theme: the signed-out shop and every collection.
   * Null until somebody saves one from the dashboard — the client then keeps
   * wearing the brand it ships with.
   */
  house: VersionedTheme<Record<string, unknown>> | null
  /** The signed-in visitor's company theme, if they have one. */
  company: (VersionedTheme<Record<string, unknown>> & { id: string }) | null
}

/** JSON with object keys sorted: Postgres `jsonb` keeps its own key order. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : v,
  )
}

function versionOf(brand: unknown): string {
  return createHash('sha1')
    .update(canonicalJson(brand))
    .digest('hex')
    .slice(0, 16)
}

function versioned<T>(brand: T): VersionedTheme<T> {
  return { version: versionOf(brand), brand }
}

export async function getHouseTheme(): Promise<
  VersionedTheme<Record<string, unknown>> | null
> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, HOUSE_THEME_KEY))
    .limit(1)
  if (!row || !row.value || typeof row.value !== 'object') return null
  return versioned(row.value as Record<string, unknown>)
}

async function getCompanyTheme(
  companyId: string,
): Promise<ThemeBundle['company']> {
  const [row] = await db
    .select({ id: companies.id, brand: companies.brand })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)
  if (!row?.brand) return null
  return { id: row.id, ...versioned(row.brand as unknown as Record<string, unknown>) }
}

export async function getThemeBundle(
  companyId: string | null | undefined,
): Promise<ThemeBundle> {
  const [house, company] = await Promise.all([
    getHouseTheme(),
    companyId ? getCompanyTheme(companyId) : Promise.resolve(null),
  ])
  return { house, company }
}

export async function setHouseTheme(
  brand: Record<string, unknown>,
  userId: string | undefined,
): Promise<VersionedTheme<Record<string, unknown>>> {
  await db
    .insert(appSettings)
    .values({ key: HOUSE_THEME_KEY, value: brand, updatedBy: userId ?? null })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: brand, updatedBy: userId ?? null, updatedAt: new Date() },
    })
  return versioned(brand)
}

/** Back to the brand the client ships with. */
export async function clearHouseTheme(): Promise<void> {
  await db.delete(appSettings).where(eq(appSettings.key, HOUSE_THEME_KEY))
}
