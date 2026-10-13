-- When the artwork for an order's custom-design items ("Eigenes Design" box,
-- card or sticker) was agreed with the customer — the to-do that marks it
-- open on the dashboard closes once this is set.
--
-- Applied with `pnpm sql sql/order-design-agreed.sql`, and safe to re-run.
-- Matches src/db/schema/orders.ts.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS design_agreed_at timestamptz;
