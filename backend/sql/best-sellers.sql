-- The proven sellers a box is built from — see `isBestSeller` in
-- src/db/schema/products.ts.
--
-- Applied with `pnpm sql sql/best-sellers.sql`, and safe to re-run.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_best_seller boolean NOT NULL DEFAULT false;
