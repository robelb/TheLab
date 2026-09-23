-- Whether a landing page offers building a box, or only buying one.
--
-- Applied with `pnpm sql sql/collection-customization.sql`, and safe to re-run.
-- Matches src/db/schema/collections.ts.

ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS allow_customization boolean NOT NULL DEFAULT true;
