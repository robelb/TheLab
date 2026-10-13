import { eq } from 'drizzle-orm'
import { env } from '../../config/env.js'
import { db } from '../../db/index.js'
import { appSettings } from '../../db/schema/index.js'

const NOTIFY_KEY = 'order_notify_emails'

/** Split a comma-separated list, trim, lower-case, de-duplicate. */
function emailList(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim().toLowerCase()).filter(Boolean))]
}

export interface NotifySettings {
  /** Who gets the "new request" email. */
  emails: string[]
  /**
   * Where the list comes from: set in the dashboard, or still the
   * `ORDER_NOTIFY_EMAIL` environment variable because nobody has saved one.
   */
  source: 'dashboard' | 'environment'
  updatedAt: string | null
}

/**
 * The team inbox(es) told about every new request.
 *
 * The list saved in the dashboard wins — even an empty one, which switches the
 * email off. Until one is saved, `ORDER_NOTIFY_EMAIL` still applies, so a
 * deploy that has only the variable keeps working.
 */
export async function getNotifySettings(): Promise<NotifySettings> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, NOTIFY_KEY))
    .limit(1)
  if (row && Array.isArray(row.value)) {
    return {
      emails: emailList(row.value.filter((v): v is string => typeof v === 'string')),
      source: 'dashboard',
      updatedAt: row.updatedAt.toISOString(),
    }
  }
  return {
    emails: emailList(env.ORDER_NOTIFY_EMAIL.split(',')),
    source: 'environment',
    updatedAt: null,
  }
}

export async function setNotifyEmails(
  emails: string[],
  userId: string | undefined,
): Promise<NotifySettings> {
  const value = emailList(emails)
  await db
    .insert(appSettings)
    .values({ key: NOTIFY_KEY, value, updatedBy: userId ?? null })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedBy: userId ?? null, updatedAt: new Date() },
    })
  return getNotifySettings()
}
