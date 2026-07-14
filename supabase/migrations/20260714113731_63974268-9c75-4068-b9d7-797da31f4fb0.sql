ALTER TABLE public.shift_additional_guides
  ADD COLUMN IF NOT EXISTS payout_tier integer,
  ADD COLUMN IF NOT EXISTS payout_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payout_paid_at timestamptz;