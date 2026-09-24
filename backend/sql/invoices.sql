-- Invoices, issued when a super admin confirms an order.
--
-- One per order (`order_id` is unique), numbered without gaps per calendar
-- year. Everything printed on the invoice is copied onto the row when it is
-- issued, so re-rendering the PDF months later gives the same document even
-- after prices, addresses or our own company details have changed.
--
-- Safe to re-run.
--
--   pnpm sql sql/invoices.sql

CREATE TABLE IF NOT EXISTS invoices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  number      text NOT NULL,
  issued_at   timestamptz NOT NULL DEFAULT now(),
  due_at      timestamptz NOT NULL,
  seller      jsonb NOT NULL,
  buyer       jsonb NOT NULL,
  lines       jsonb NOT NULL,
  net         numeric(10, 2) NOT NULL,
  vat_rate    numeric(5, 2) NOT NULL,
  vat         numeric(10, 2) NOT NULL,
  gross       numeric(10, 2) NOT NULL,
  currency    text NOT NULL,
  locale      text NOT NULL DEFAULT 'de',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS invoices_order_idx ON invoices (order_id);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_idx ON invoices (number);

-- The running number per series (`RE-2026`). Incremented with a single upsert
-- so two confirmations at once cannot draw the same number, with no
-- transaction. Keyed by prefix as well as year so a `TEST` series never uses
-- up a real invoice number.

CREATE TABLE IF NOT EXISTS invoice_counters (
  series  text PRIMARY KEY,
  last    integer NOT NULL DEFAULT 0
);
