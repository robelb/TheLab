import {
  boolean,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * Super-admin overrides for the AI prompts ("system instructions").
 *
 * One row per instruction key (e.g. `brand-customize`). A row REPLACES the
 * built-in prompt builder for that key when `is_active` is true; when the row
 * is missing or inactive, the hardcoded builder runs exactly as before — so a
 * database without these rows behaves identically to the pre-feature deploy.
 *
 * `content` is a template: `{{placeholder}}` tokens are substituted with
 * runtime data (product lists, measured logo facts, company name, …) by
 * `renderInstructionTemplate`. The valid placeholders per key are declared in
 * `systemInstruction/registry.ts`.
 */
export const systemInstructions = pgTable(
  'system_instructions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Registry key, e.g. `brand-customize`. One override per key. */
    key: text('key').notNull(),
    content: text('content').notNull(),
    /** Off = keep the row (draft/history) but use the built-in prompt. */
    isActive: boolean('is_active').notNull().default(true),
    /**
     * Last editor's user id. Deliberately NOT a FK (same convention as
     * `companies.ownerUserId`) so deleting a user never touches prompts.
     */
    updatedBy: uuid('updated_by'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex('system_instructions_key_idx').on(table.key)],
)

export type SystemInstruction = typeof systemInstructions.$inferSelect
