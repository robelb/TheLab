-- The supplier's full record for a product, for fields with no column of their own.
--
-- Applied with `pnpm sql sql/product-source-data.sql`, and safe to re-run.
-- Matches src/db/schema/products.ts.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS source_data jsonb;
