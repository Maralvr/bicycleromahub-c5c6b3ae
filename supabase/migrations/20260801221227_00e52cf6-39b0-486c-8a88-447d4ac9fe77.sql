-- Documentation/drift fix, not a behavior change.
--
-- Same problem, same shape as 20260709000000_fix_bokun_cron_schedule_drift.sql:
-- the three Bokun maintenance cron jobs currently running in production were
-- created directly against the live database and never captured in a migration
-- file. Git and the database disagreed, which is exactly how the dead
-- 'sync-bokun-bookings' function URL survived unnoticed while
-- cron.job_run_details kept reporting "succeeded" on a 404.
--
-- This file re-asserts, verbatim, the state that is already live as of
-- 2026-08-01 22:11 UTC, so the migration history is the source of truth again.
--
-- Live state being documented (from cron.job):
--   sync-bokun-daily-safety-net    '0 4 * * *'       -> /api/public/hooks/sync-bokun
--   backfill-bokun-refs-hourly     '10 * * * *'      -> /api/public/hooks/backfill-bokun-refs
--   heal-bokun-zeros-every-30min   '25,55 * * * *'   -> /api/public/hooks/heal-bokun-zeros
--
-- Notes:
--   * All three hit /api/public/* routes, which bypass site auth. The apikey
--     header below is the project's publishable/anon key -- not a secret.
--   * Schedules are offset on purpose: backfill runs at :10 so parent refs are
--     resolved before heal runs at :25/:55, and the daily sync at 04:00 sits
--     after prune-bokun-import-runs (03:30).
--   * timeout_milliseconds is 55s because these hooks do multi-page Bokun API
--     work and the pg_net default aborted them mid-flight.
--   * Unschedule-then-schedule keeps this re-runnable; do NOT add new Bokun
--     cron jobs outside a migration file.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $do$
DECLARE
  v_jobname text;
BEGIN
  FOREACH v_jobname IN ARRAY ARRAY[
    'sync-bokun-daily-safety-net',
    'backfill-bokun-refs-hourly',
    'heal-bokun-zeros-every-30min',
    'bokun-sync-daily-4am-utc'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = v_jobname) THEN
      PERFORM cron.unschedule(v_jobname);
    END IF;
  END LOOP;
END
$do$;

-- Daily safety-net full sync (04:00 UTC).
SELECT cron.schedule(
  'sync-bokun-daily-safety-net',
  '0 4 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://project--d10b7846-1048-4145-87e5-4eabec45c97d.lovable.app/api/public/hooks/sync-bokun',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsZmNia21qemNzdmd5bG5zYnZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNjU2MzUsImV4cCI6MjA5Mzc0MTYzNX0.hbmB5Cfd5DJhcR0HIlowI54959rP1P8Z9PBU3XC9Gzk"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) AS request_id;
  $job$
);

-- Resolve missing external_booking_ref (parent booking ids) hourly at :10.
SELECT cron.schedule(
  'backfill-bokun-refs-hourly',
  '10 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://project--d10b7846-1048-4145-87e5-4eabec45c97d.lovable.app/api/public/hooks/backfill-bokun-refs',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsZmNia21qemNzdmd5bG5zYnZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNjU2MzUsImV4cCI6MjA5Mzc0MTYzNX0.hbmB5Cfd5DJhcR0HIlowI54959rP1P8Z9PBU3XC9Gzk"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) AS request_id;
  $job$
);

-- Re-fetch bookings stuck at 0 participants, twice an hour at :25 and :55.
SELECT cron.schedule(
  'heal-bokun-zeros-every-30min',
  '25,55 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://project--d10b7846-1048-4145-87e5-4eabec45c97d.lovable.app/api/public/hooks/heal-bokun-zeros',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsZmNia21qemNzdmd5bG5zYnZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNjU2MzUsImV4cCI6MjA5Mzc0MTYzNX0.hbmB5Cfd5DJhcR0HIlowI54959rP1P8Z9PBU3XC9Gzk"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) AS request_id;
  $job$
);