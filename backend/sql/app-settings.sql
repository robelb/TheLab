-- Settings the team changes from the dashboard rather than by redeploying:
-- one row per key, its value as JSON. First used for the inbox(es) told about
-- every new request (`order_notify_emails`).
--
-- Applied with `pnpm sql sql/app-settings.sql`, and safe to re-run.
-- Matches src/db/schema/app-settings.ts.

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
