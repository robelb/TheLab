import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/** Copy that has to exist in both languages a campaign might run in. */
export interface LocalizedText {
  de: string
  en: string
}

/**
 * A landing page's slice of the shop, addressable by URL.
 *
 * An ad lands on `/c/weihnachten` and gets a Christmas headline, three boxes to
 * buy outright, and a catalogue filtered to `tag = 'christmas'`. That is the
 * whole of it: a collection owns no products of its own, it points at a tag and
 * names the bundles worth showing first.
 *
 * Copy is stored per language rather than translated on the client because the
 * marketing side writes it, changes it mid-campaign, and never ships a build.
 */
export const collections = pgTable(
  'collections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The URL segment: `/c/:slug`. Lowercase, hyphenated. */
    slug: text('slug').notNull(),
    title: jsonb('title').$type<LocalizedText>().notNull(),
    subtitle: jsonb('subtitle').$type<LocalizedText | null>(),
    /** Which product tag this collection filters the catalogue by. */
    tag: text('tag').notNull(),
    /** Bundles shown as the headline offers, in the order given. */
    featuredBundleIds: jsonb('featured_bundle_ids')
      .$type<string[]>()
      .notNull()
      .default([]),
    /** Language a visitor gets unless `?lang=` says otherwise. */
    defaultLocale: text('default_locale').notNull().default('de'),
    /** Off switch for a campaign that has ended, without losing the config. */
    active: boolean('active').notNull().default(true),
    /**
     * Whether this page offers building and branding a box, or only buying one.
     *
     * Some campaigns sell a finished thing: showing a "build your own" route on
     * those adds a decision the ad did not promise, and a step to lose people
     * at. Turning it off hides the builder, the customise buttons and the design
     * editor for everything reached through this page.
     */
    allowCustomization: boolean('allow_customization').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('collections_slug_idx').on(table.slug),
    index('collections_active_idx').on(table.active),
  ],
)

export type Collection = typeof collections.$inferSelect
export type NewCollection = typeof collections.$inferInsert
