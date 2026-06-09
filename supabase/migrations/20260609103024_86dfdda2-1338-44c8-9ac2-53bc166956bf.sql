-- Lock down Realtime channel subscriptions.
-- Without policies on realtime.messages, any authenticated user could subscribe
-- to any topic (postgres_changes / broadcast / presence). The app currently
-- relies on Postgres-changes channels named 'shifts-realtime',
-- 'guide-notifications-realtime', 'rental-points-realtime', and
-- 'dispatch-events-realtime'. Row-level filtering on the underlying tables
-- already enforces per-user visibility; here we just gate channel access to
-- authenticated users and explicitly deny anonymous.

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read app realtime channels" ON realtime.messages;
CREATE POLICY "Authenticated can read app realtime channels"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() IN (
      'shifts-realtime',
      'guide-notifications-realtime',
      'rental-points-realtime',
      'dispatch-events-realtime'
    )
  );

DROP POLICY IF EXISTS "Authenticated can publish to app realtime channels" ON realtime.messages;
CREATE POLICY "Authenticated can publish to app realtime channels"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    realtime.topic() IN (
      'shifts-realtime',
      'guide-notifications-realtime',
      'rental-points-realtime',
      'dispatch-events-realtime'
    )
  );