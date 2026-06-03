import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('categories_name_idx').on(table.name),
    uniqueIndex('categories_slug_idx').on(table.slug),
  ],
)

export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert
