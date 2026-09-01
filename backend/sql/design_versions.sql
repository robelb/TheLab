-- Saved design versions (points 12/14 of the design-page review).
--
-- This project has no drizzle migration history — the schema is applied with
-- `npm run db:push`. Running `db:generate` here would emit a baseline for all
-- eleven tables, so this file carries only the new one and is safe to apply on
-- its own. `db:push` against the same schema is the other option; either way
-- the result matches src/db/schema/design-versions.ts.

CREATE TABLE IF NOT EXISTS design_versions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id          uuid NOT NULL REFERENCES products(id)  ON DELETE CASCADE,
  label               text NOT NULL,
  source_image_url    text NOT NULL,
  flat_image_url      text,
  photoreal_image_url text,
  prompt              text,
  layout              jsonb,
  logo_url            text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS design_versions_company_product_idx
  ON design_versions (company_id, product_id);
