-- Fix "infinite recursion detected in policy for relation staff" that broke
-- EVERY staff/shifts query app-wide (not just for rental staff) as soon as
-- the previous migration shipped.
--
-- What happened: "staff_select_rental_staff" (added last migration) let a
-- rental staff account read a staff row by subquerying public.shifts
-- directly:
--     id IN (SELECT assigned_staff_id FROM public.shifts WHERE ...)
-- But public.shifts already has its own RLS ("shifts_select") that
-- subqueries public.staff:
--     assigned_staff_id IN (SELECT id FROM public.staff WHERE profile_id = ...)
-- That's a two-table cycle: evaluating staff's RLS requires evaluating
-- shifts' RLS, which requires re-evaluating staff's RLS, forever. Postgres
-- detects this and throws "infinite recursion detected in policy for
-- relation \"staff\"" for ANY query touching staff or shifts, for every
-- role (admin, guide, rental staff alike) -- which is why the whole app
-- started showing the generic error screen on refresh.
--
-- Fix: move the shifts lookup into a SECURITY DEFINER helper function
-- (same pattern already used by has_role() elsewhere in this schema). A
-- security-definer function runs as its owner, which owns public.shifts
-- and therefore bypasses shifts' RLS internally -- so checking it no longer
-- re-triggers shifts' policies, breaking the cycle.
CREATE OR REPLACE FUNCTION public.is_staff_assigned_to_rental_shift(_staff_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shifts
    WHERE assigned_staff_id = _staff_id AND rental_point_id IS NOT NULL
  );
$$;

DROP POLICY IF EXISTS "staff_select_rental_staff" ON public.staff;
CREATE POLICY "staff_select_rental_staff" ON public.staff FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'rental_staff'::app_role)
  AND public.is_staff_assigned_to_rental_shift(id)
);
