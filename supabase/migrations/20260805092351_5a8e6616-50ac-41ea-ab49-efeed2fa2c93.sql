select cron.schedule(
  'bokun-sync-resume',
  '20 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--d10b7846-1048-4145-87e5-4eabec45c97d.lovable.app/api/public/hooks/sync-bokun',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsZmNia21qemNzdmd5bG5zYnZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNjU2MzUsImV4cCI6MjA5Mzc0MTYzNX0.hbmB5Cfd5DJhcR0HIlowI54959rP1P8Z9PBU3XC9Gzk"}'::jsonb,
    body := '{"resumeOnly": true}'::jsonb,
    timeout_milliseconds := 55000
  ) AS request_id;
  $$
);