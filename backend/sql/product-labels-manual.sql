-- Badges (vegan, Bio) set by hand in the dashboard. Once someone has set a
-- product's labels there, a catalogue resync (`pnpm sync:endeavour`,
-- `pnpm sync:labels`) leaves them alone instead of overwriting them.
--
-- Applied with `pnpm sql sql/product-labels-manual.sql`, and safe to re-run.
-- Matches src/db/schema/products.ts.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS labels_edited_at timestamptz;
