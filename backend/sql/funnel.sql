-- The ad funnel: pre-configured boxes, landing collections, guest requests and
-- the outbound lead feed.
--
-- This project has no drizzle migration history — the schema is applied with
-- `npm run db:push`, and `db:generate` would emit a baseline for every table.
-- So this file carries only what is new and is safe to apply on its own, and
-- safe to re-run. Matches src/db/schema/{products,product-components,
-- collections,orders,campaigns,outbound-events}.ts.

-- 1. Products gain a kind, occasion tags and a supplier minimum. ------------

ALTER TABLE products ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'single';
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_quantity integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS products_kind_idx ON products (kind);

-- 2. What a pre-configured box is made of. ---------------------------------

CREATE TABLE IF NOT EXISTS product_components (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id    uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  component_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity     integer NOT NULL DEFAULT 1,
  role         text NOT NULL DEFAULT 'item',
  sort_order   integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS product_components_bundle_component_idx
  ON product_components (bundle_id, component_id);
CREATE INDEX IF NOT EXISTS product_components_bundle_idx
  ON product_components (bundle_id);

-- 3. Landing collections addressed by URL. ---------------------------------

CREATE TABLE IF NOT EXISTS collections (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                text NOT NULL,
  title               jsonb NOT NULL,
  subtitle            jsonb,
  tag                 text NOT NULL,
  featured_bundle_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_locale      text NOT NULL DEFAULT 'de',
  active              boolean NOT NULL DEFAULT true,
  sort_order          integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS collections_slug_idx ON collections (slug);
CREATE INDEX IF NOT EXISTS collections_active_idx ON collections (active);

-- 4. Requests can now arrive without an account behind them. ---------------

ALTER TABLE orders ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN user_id DROP NOT NULL;

-- The old cascade would take a guest's request with it; there is nothing to
-- cascade from when company_id is null, and a closed company should not erase
-- the record of what it asked for.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_company_id_companies_id_fk;
ALTER TABLE orders ADD CONSTRAINT orders_company_id_companies_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'storefront';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'en';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS collection_slug text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS attribution jsonb;

CREATE INDEX IF NOT EXISTS orders_source_created_idx
  ON orders (source, created_at DESC);

-- 5. Campaign ownership, stated rather than inferred from a null domain. ---

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS owner_kind text NOT NULL DEFAULT 'company';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS guest_session_id text;

-- Everything that exists today predates guests: a null domain was a preset.
UPDATE campaigns
   SET owner_kind = CASE WHEN domain IS NULL THEN 'preset' ELSE 'company' END
 WHERE owner_kind = 'company' AND domain IS NULL;

CREATE INDEX IF NOT EXISTS campaigns_owner_kind_idx ON campaigns (owner_kind);

-- 6. The outbound lead queue. ----------------------------------------------

CREATE TABLE IF NOT EXISTS outbound_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL,
  target          text NOT NULL,
  payload         jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'pending',
  attempts        integer NOT NULL DEFAULT 0,
  last_error      text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);

CREATE INDEX IF NOT EXISTS outbound_events_due_idx
  ON outbound_events (status, next_attempt_at);
