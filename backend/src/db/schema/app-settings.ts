import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * Settings the team changes from the dashboard rather than by redeploying.
 *
 * One row per key, its value as JSON. A missing row means "not set here", and
 * the setting falls back to its environment variable — so a database without
 * the row behaves exactly like before.
 */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  /** Last editor's user id; not a FK, so deleting a user never touches it. */
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export type AppSetting = typeof appSettings.$inferSelect
