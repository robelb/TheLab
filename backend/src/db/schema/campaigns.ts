import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

/** Lifecycle of the composite bundle ("hero") image generation. */
export type CampaignHeroImageStatus = 'idle' | 'pending' | 'ready' | 'failed'

/**
 * Who a campaign belongs to.
 *
 * `domain IS NULL` used to mean "preset" on its own. Once signed-out visitors
 * could build boxes, every one of their drafts landed in that same null
 * partition and showed up as a house preset, so ownership is now stated rather
 * than inferred from a missing domain.
 */
export type CampaignOwnerKind = 'preset' | 'company' | 'guest'

/**
 * Auto-assembled "Your Company Kit" starter campaigns.
 * `domain` is nullable so demo/preset-mode campaigns share a null partition.
 * `status` is plain text (codebase convention) — values constrained in Zod.
 *
 * A campaign may have many marketing videos shown as ads on the storefront —
 * see the `campaign_videos` table.
 */
export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    domain: text('domain'),
    ownerKind: text('owner_kind')
      .$type<CampaignOwnerKind>()
      .notNull()
      .default('company'),
    /** Which anonymous browser owns this, when `ownerKind` is `guest`. */
    guestSessionId: text('guest_session_id'),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    status: text('status').notNull().default('draft'),
    productIds: jsonb('product_ids').$type<string[]>().notNull().default([]),
    heroImageUrl: text('hero_image_url'),
    /**
     * The exact bundle the current `heroImageUrl` was rendered from. Compared
     * against `productIds` to tell whether the image still matches the bundle.
     * Empty for pre-existing campaigns (unknown provenance → treated as fresh).
     */
    heroImageProductIds: jsonb('hero_image_product_ids')
      .$type<string[]>()
      .notNull()
      .default([]),
    heroImageStatus: text('hero_image_status')
      .$type<CampaignHeroImageStatus>()
      .notNull()
      .default('idle'),
    heroImageError: text('hero_image_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('campaigns_domain_idx').on(table.domain),
    index('campaigns_owner_kind_idx').on(table.ownerKind),
  ],
)

export type Campaign = typeof campaigns.$inferSelect
export type NewCampaign = typeof campaigns.$inferInsert
