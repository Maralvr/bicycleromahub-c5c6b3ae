ALTER TABLE public.guide_payout_rates ADD COLUMN IF NOT EXISTS private_rate numeric;

ALTER TABLE public.shifts DROP CONSTRAINT IF EXISTS shifts_payout_tier_check;
ALTER TABLE public.shifts ADD CONSTRAINT shifts_payout_tier_check CHECK (payout_tier = ANY (ARRAY[1,2,3]));