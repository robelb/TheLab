import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type { AnalyzeWithCustomizationResult } from '../../customizer/analyzeWithCustomization.js'

/**
 * The persisted brand for a company — the full extraction + customization
 * payload produced once at onboarding and reused for every later same-domain
 * user (so we never re-extract on login). Mirrors the client `ExtractionPayload`.
 */
export type CompanyBrand = AnalyzeWithCustomizationResult

export type CompanyBrandStatus = 'pending' | 'ready' | 'failed' | 'skipped'

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** Email/brand domain, e.g. `biglittlethings.de`. One company per domain. */
    domain: text('domain').notNull(),
    sourceUrl: text('source_url'),
    /**
     * Owner user id. Deliberately NOT a FK: `users.companyId` already references
     * `companies`, and a mutual FK would create a circular import between the two
     * schema files. The owner is also derivable via `role = 'company_owner'`, so
     * this column is a convenience pointer, not the source of truth.
     */
    ownerUserId: uuid('owner_user_id'),
    /** Persisted extraction result (brand theme + colors/fonts/logo). */
    brand: jsonb('brand').$type<CompanyBrand>(),
    /** Cache-bust key for branded product images (matches customizationGeneration). */
    brandGeneration: text('brand_generation'),
    /** Status of the (blocking) theme extraction: colors/fonts/logo. */
    brandStatus: text('brand_status')
      .$type<CompanyBrandStatus>()
      .notNull()
      .default('pending'),
    brandError: text('brand_error'),
    /** Status of the (background) featured-product image generation. */
    imagesStatus: text('images_status')
      .$type<CompanyBrandStatus>()
      .notNull()
      .default('pending'),
    imagesError: text('images_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex('companies_domain_idx').on(table.domain)],
)

export type Company = typeof companies.$inferSelect
export type NewCompany = typeof companies.$inferInsert
