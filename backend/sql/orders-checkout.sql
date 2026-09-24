-- Guest checkout: where an order came from, who pays for it, and the price it
-- was finally agreed at.
--
-- A request still arrives as a request. What changes is that it now carries
-- everything an invoice needs (billing address, VAT id, PO number), and that
-- the price a super admin confirms is stored next to the estimate the shopper
-- saw, together with the VAT on it.
--
-- Safe to re-run.
--
--   pnpm sql sql/orders-checkout.sql

-- 1. Which collection, by id and by the name it had at the time. ------------

ALTER TABLE orders ADD COLUMN IF NOT EXISTS collection_id uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS collection_name text;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_collection_id_collections_id_fk;
ALTER TABLE orders ADD CONSTRAINT orders_collection_id_collections_id_fk
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_collection_idx ON orders (collection_id);

-- 2. Who the invoice goes to, and how it is paid. -------------------------

ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS privacy_accepted_at timestamptz;

-- 3. The price as confirmed. Empty until a super admin confirms. -----------

ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmed_by uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_rate numeric(5, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat numeric(10, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_gross numeric(10, 2);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_confirmed_by_users_id_fk;
ALTER TABLE orders ADD CONSTRAINT orders_confirmed_by_users_id_fk
  FOREIGN KEY (confirmed_by) REFERENCES users(id) ON DELETE SET NULL;

-- 4. Backfill the collection id for requests that only carried the slug. ----

UPDATE orders o
   SET collection_id = c.id,
       collection_name = COALESCE(c.title->>'de', c.title->>'en', c.slug)
  FROM collections c
 WHERE o.collection_id IS NULL
   AND o.collection_slug IS NOT NULL
   AND c.slug = o.collection_slug;
