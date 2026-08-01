-- The app only *listens* on postgres_changes channels; it never publishes
-- broadcast messages. A broad INSERT policy on realtime.messages is therefore
-- pure attack surface: it let any authenticated user inject fake messages into
-- shared topics like 'guide-notifications-realtime'. Remove it.
DROP POLICY IF EXISTS "Authenticated can publish to app realtime channels" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated users can publish to app channels" ON realtime.messages;

-- Reads stay limited to the app's own channel prefixes for authenticated users.
-- Actual row visibility for postgres_changes is enforced by RLS on the
-- underlying tables (guide_notifications is scoped to the caller's staff row,
-- shift_dispatch_events to their own assignments), so a subscriber cannot see
-- another user's rows even on a shared topic name.
DROP POLICY IF EXISTS "Authenticated can read app realtime channels" ON realtime.messages;
CREATE POLICY "Authenticated can read app realtime channels"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() LIKE 'shifts-realtime%'
    OR realtime.topic() LIKE 'guide-notifications-realtime%'
    OR realtime.topic() LIKE 'rental-points-realtime%'
    OR realtime.topic() LIKE 'dispatch-events-realtime%'
    OR realtime.topic() LIKE 'task-updates-live%'
  );