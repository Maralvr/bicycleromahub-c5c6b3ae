DO $$
DECLARE
  v_jobid bigint;
BEGIN
  -- Unschedule ALL existing bokun sync cron jobs (we'll create one fresh)
  FOR v_jobid IN
    SELECT jobid FROM cron.job
    WHERE command ILIKE '%sync-bokun%' OR jobname ILIKE '%bokun%'
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;
END
$$;

-- Create exactly one cron job, every 5 minutes
SELECT cron.schedule(
  'bokun-sync-every-5-min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--d10b7846-1048-4145-87e5-4eabec45c97d.lovable.app/api/public/hooks/sync-bokun',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);