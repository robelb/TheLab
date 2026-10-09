-- What the Christmas MVP needs the database to hold: graduated prices and
-- labels on products, box building as its own collection switch, and the
-- shipping choices, recipients and fulfilment fee on an order.
--
-- Applied with `pnpm sql sql/p0-christmas.sql`, and safe to re-run.
-- Matches src/db/schema/products.ts, collections.ts and orders.ts.

-- ── Products ───────────────────────────────────────────────────────────────

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS graduated_prices jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS labels jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS source_synced_at timestamptz;

-- ── Collections ────────────────────────────────────────────────────────────

ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS allow_box_building boolean NOT NULL DEFAULT true;

-- Christmas is switched to "build on, customise off" together with the UI
-- change that makes the builder follow allow_box_building instead of
-- allow_customization. Doing it here first would hide the builder.

-- ── Orders ─────────────────────────────────────────────────────────────────

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_method text NOT NULL DEFAULT 'bulk';

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_shipping_method_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_shipping_method_check
  CHECK (shipping_method IN ('bulk', 'individual', 'mixed'));

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_split jsonb;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS addresses_later boolean NOT NULL DEFAULT false;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS recipients jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fulfilment_fee numeric(10, 2) NOT NULL DEFAULT 0;
