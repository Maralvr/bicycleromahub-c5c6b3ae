-- Canonical, replayable definition of the nightly Bokun product-rates job.
-- Matches the live cron.job row exactly (immutable project URL + 55s timeout).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-bokun-product-rates') THEN
    PERFORM cron.unschedule('sync-bokun-product-rates');
  END IF;
END
$do$;

SELECT cron.schedule(
  'sync-bokun-product-rates',
  '40 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--d10b7846-1048-4145-87e5-4eabec45c97d.lovable.app/api/public/hooks/sync-bokun-product-rates',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsZmNia21qemNzdmd5bG5zYnZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNjU2MzUsImV4cCI6MjA5Mzc0MTYzNX0.hbmB5Cfd5DJhcR0HIlowI54959rP1P8Z9PBU3XC9Gzk"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) AS request_id;
  $$
);