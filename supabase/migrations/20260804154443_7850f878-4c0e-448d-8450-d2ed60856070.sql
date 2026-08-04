ALTER TABLE public.rental_point_day_assignments
  DROP CONSTRAINT IF EXISTS rpda_status_check;

ALTER TABLE public.rental_point_day_assignments
  ADD CONSTRAINT rpda_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'cancelled'::text]));