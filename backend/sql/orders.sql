-- Requests for a box.
--
-- This project has no drizzle migration history — the schema is applied with
-- `npm run db:push`, and `db:generate` would emit a baseline for every table.
-- So this file carries only the new one and is safe to apply on its own.
-- Matches src/db/schema/orders.ts.

CREATE TABLE IF NOT EXISTS orders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id),
  reference   text NOT NULL UNIQUE,
  status      text NOT NULL DEFAULT 'new',
  contact     jsonb NOT NULL,
  delivery    jsonb,
  items       jsonb NOT NULL,
  subtotal    numeric(10, 2) NOT NULL,
  shipping    numeric(10, 2) NOT NULL,
  total       numeric(10, 2) NOT NULL,
  currency    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_company_created_idx
  ON orders (company_id, created_at DESC);
