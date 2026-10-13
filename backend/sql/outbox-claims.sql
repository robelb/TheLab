-- When a queued email or webhook was picked up for sending.
--
-- Rows stuck in `sending` (the process died mid-send) are put back in the
-- queue after a while. That used to be judged by when the row was CREATED,
-- so a retry hours later could be reclaimed while another instance was still
-- sending it — and the customer got it twice. It is now judged by when the
-- send started.
--
-- Applied with `pnpm sql sql/outbox-claims.sql`, and safe to re-run.
-- Matches src/db/schema/outbound-events.ts.

ALTER TABLE outbound_events
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
