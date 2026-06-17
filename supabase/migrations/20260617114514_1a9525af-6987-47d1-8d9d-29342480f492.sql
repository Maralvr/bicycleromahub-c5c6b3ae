
-- Allow staff to edit their own skills/languages/licenses/phone on their own staff row.
DROP POLICY IF EXISTS staff_self_update ON public.staff;
CREATE POLICY staff_self_update ON public.staff
  FOR UPDATE
  USING (profile_id = auth.uid())
  WITH CHECK (
    profile_id = auth.uid()
    AND role   = (SELECT s.role   FROM public.staff s WHERE s.id = staff.id)
    AND active = (SELECT s.active FROM public.staff s WHERE s.id = staff.id)
    AND NOT (status IS DISTINCT FROM (SELECT s.status FROM public.staff s WHERE s.id = staff.id))
  );

-- Allow users to manage their own rental-point assignments (multi-select).
DROP POLICY IF EXISTS srp_self_insert ON public.staff_rental_points;
DROP POLICY IF EXISTS srp_self_delete ON public.staff_rental_points;
CREATE POLICY srp_self_insert ON public.staff_rental_points
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_primary = false);
CREATE POLICY srp_self_delete ON public.staff_rental_points
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
