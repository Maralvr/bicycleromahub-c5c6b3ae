-- A tour's private (vs public) departure is often paid at a different rate
-- than the standard Tier 1 / Tier 2 amounts. Add a third, optional rate
-- per tour rather than overloading Tier 1/2 -- admins keep picking a tier
-- by hand per shift (per product decision), this just gives them a third,
-- explicitly-labeled option to pick when a shift was a private tour.
--
-- Nullable: a tour with no private_rate configured simply doesn't offer
-- the "Private" option in the tier picker.

ALTER TABLE public.guide_payout_rates ADD COLUMN IF NOT EXISTS private_rate numeric;

-- Allow payout_tier = 3 ("Private") alongside the existing 1/2.
ALTER TABLE public.shifts DROP CONSTRAINT IF EXISTS shifts_payout_tier_check;
ALTER TABLE public.shifts ADD CONSTRAINT shifts_payout_tier_check CHECK (payout_tier IN (1, 2, 3));
