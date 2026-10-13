-- Orders outlive the company and the user that sent them.
--
-- sql/orders.sql declared both links inline, so Postgres named them
-- `orders_company_id_fkey` / `orders_user_id_fkey`. sql/funnel.sql later added
-- the intended `ON DELETE SET NULL` company link under the Drizzle name but
-- dropped the wrong old one — so the original `ON DELETE CASCADE` survived
-- beside it, and deleting a company deleted all its orders (or failed outright
-- once one of them had an invoice). The user link had no rule at all, so a user
-- who had ever sent a request could not be deleted.
--
-- Applied with `pnpm sql sql/fix-order-links.sql`, and safe to re-run.
-- Matches src/db/schema/orders.ts.

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_company_id_fkey;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_user_id_fkey;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_user_id_users_id_fk;
ALTER TABLE orders ADD CONSTRAINT orders_user_id_users_id_fk
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
