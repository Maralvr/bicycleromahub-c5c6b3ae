ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS bokun_rate_id text;
COMMENT ON COLUMN public.shifts.bokun_rate_id IS 'Bokun rate id for the booked pricing option; stable across locales, used to resolve the canonical English rate title from public.bokun_product_rates.';
CREATE INDEX IF NOT EXISTS shifts_bokun_rate_id_idx ON public.shifts (bokun_rate_id) WHERE bokun_rate_id IS NOT NULL;