CREATE TABLE public.bokun_product_rates (
  bokun_product_id text PRIMARY KEY,
  title text,
  rates jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_rate_id text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.bokun_product_rates TO authenticated;
GRANT ALL ON public.bokun_product_rates TO service_role;

ALTER TABLE public.bokun_product_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can read product rates"
ON public.bokun_product_rates
FOR SELECT
TO authenticated
USING (true);

CREATE TRIGGER set_bokun_product_rates_updated_at
BEFORE UPDATE ON public.bokun_product_rates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'sync-bokun-product-rates',
  '40 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--d10b7846-1048-4145-87e5-4eabec45c97d.lovable.app/api/public/hooks/sync-bokun-product-rates',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsZmNia21qemNzdmd5bG5zYnZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNjU2MzUsImV4cCI6MjA5Mzc0MTYzNX0.hbmB5Cfd5DJhcR0HIlowI54959rP1P8Z9PBU3XC9Gzk"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);