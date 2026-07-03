-- Schedule the shift/rental-point reminder webhook to actually run.
--
-- send_shift_reminders() (guides, 24h + 2h before a shift) and
-- send_rental_point_reminders() (rental staff, 24h + 2h before their
-- rental-point day) are both fully implemented and wired up behind
-- POST /api/public/hooks/send-shift-reminders — but nothing was ever
-- calling that endpoint. Only the Bokun sync had a cron job. As a
-- result neither guides nor rental staff were receiving their 24h/2h
-- reminder notifications or wake-up pushes in production.
--
-- This mirrors the existing bokun-sync-every-5-min job exactly.
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  FOR v_jobid IN
    SELECT jobid FROM cron.job
    WHERE command ILIKE '%send-shift-reminders%' OR jobname ILIKE '%shift-reminders%'
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;
END
$$;

SELECT cron.schedule(
  'send-shift-reminders-every-5-min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--d10b7846-1048-4145-87e5-4eabec45c97d.lovable.app/api/public/hooks/send-shift-reminders',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
