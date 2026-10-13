-- Keeping the catalogue safe across resyncs.
--
-- - `active`: whether a product is for sale. A product Endeavour no longer
--   has, or a new shop product that arrives without a price, is taken out of
--   sale rather than deleted (orders and designs still point at it) or sold
--   for nothing. The shop, its search and the box builder show only active
--   products; the dashboard shows all.
-- - `price_edited_at` / `tags_edited_at`: set when someone changes a product's
--   price or its tags (collection membership) by hand. The resync then keeps
--   those instead of overwriting them — as `labels_edited_at` does for labels.
-- - A GIN index on `tags`, which every collection page filters by.
--
-- Applied with `pnpm sql sql/catalogue-safety.sql`, and safe to re-run.
-- Matches src/db/schema/products.ts.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS price_edited_at timestamptz;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS tags_edited_at timestamptz;

CREATE INDEX IF NOT EXISTS products_tags_gin_idx ON products USING gin (tags);
