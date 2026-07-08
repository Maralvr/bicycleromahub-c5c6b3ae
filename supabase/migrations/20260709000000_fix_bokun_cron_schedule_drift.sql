-- Documentation/drift fix, not a behavior change.
--
-- The migration that originally created the Bokun sync cron job
-- (20260528233212...sql) scheduled it for '*/5 * * * *' (every 5 minutes).
-- At some point the live schedule was changed directly (via Lovable) to
-- run once a day at 04:00 UTC instead -- confirmed via the "Bokun import
-- runs" admin page, which reads the actual live cron.job row and showed
-- schedule "0 4 * * *" with a last-run timestamp matching a once-daily
-- cadence. That change was never reflected back into a migration file, so
-- git and the live database disagreed about how often this runs -- the
-- same class of drift we've hit a few times this session with other
-- Lovable-applied changes.
--
-- This just re-asserts the schedule that is already live, so the two are
-- back in sync and anyone reading the migration history isn't misled into
-- thinking this still runs every 5 minutes.
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  FOR v_jobid IN
    SELECT jobid FROM cron.job
    WHERE command ILIKE '%sync-bokun%' OR jobname ILIKE '%bokun%'
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;
END
$$;

SELECT cron.schedule(
  'bokun-sync-daily-4am-utc',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--d10b7846-1048-4145-87e5-4eabec45c97d.lovable.app/api/public/hooks/sync-bokun',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
