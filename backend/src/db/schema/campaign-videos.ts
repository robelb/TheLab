import {
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { campaigns } from './campaigns.js'

/** pgvector column matching the products embedding dimensionality (768). */
const vector = customType<{ data: number[]; driverName: string }>({
  dataType() {
    return 'vector(768)'
  },
  toDriver(value: number[]) {
    return `[${value.join(',')}]`
  },
  fromDriver(value: unknown) {
    if (typeof value === 'string') {
      return JSON.parse(value.replace('(', '[').replace(')', ']')) as number[]
    }
    return value as number[]
  },
})

/**
 * Marketing videos attached to a campaign, shown as ads on the storefront.
 * A campaign can have many. `orientation` drives the storefront slot (portrait
 * → side rail, landscape → hero); the `startsAt`/`endsAt` window and the
 * description `embedding` drive when and to whom each video shows.
 */
export const campaignVideos = pgTable(
  'campaign_videos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    description: text('description'),
    orientation: text('orientation'), // 'portrait' | 'landscape'
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    priority: integer('priority').notNull().default(0),
    embedding: vector('embedding'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('campaign_videos_campaign_idx').on(table.campaignId)],
)

export type CampaignVideo = typeof campaignVideos.$inferSelect
export type NewCampaignVideo = typeof campaignVideos.$inferInsert
