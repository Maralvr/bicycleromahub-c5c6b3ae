-- Each additional guide on a booking gets paid independently at the full
-- rate (product decision), same as the primary guide -- so payout
-- tracking (tier picked, paid/unpaid, paid-at timestamp) needs to live per
-- additional-guide row too, not just on shifts (which only has one payout
-- slot, for the primary assigned_staff_id).

ALTER TABLE public.shift_additional_guides
  ADD COLUMN IF NOT EXISTS payout_tier integer,
  ADD COLUMN IF NOT EXISTS payout_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payout_paid_at timestamptz;
