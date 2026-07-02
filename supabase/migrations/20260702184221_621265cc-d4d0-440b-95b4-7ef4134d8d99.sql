
-- 1. Lock down SECURITY DEFINER functions callable by anon
REVOKE EXECUTE ON FUNCTION public.accept_rental_day(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_rental_day(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_signed_waiver_shift_ids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.expire_rental_day_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_rental_day(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_rental_day(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_signed_waiver_shift_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_rental_day_requests() TO service_role;

-- 2. Remove overbroad rental_staff SELECT on rental_point_day_assignments
DROP POLICY IF EXISTS rpda_rental_staff_select ON public.rental_point_day_assignments;

-- 3. Restrict staff self-update to authenticated role only
DROP POLICY IF EXISTS staff_self_update ON public.staff;
CREATE POLICY staff_self_update ON public.staff
  FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (
    profile_id = auth.uid()
    AND role = (SELECT s.role FROM public.staff s WHERE s.id = staff.id)
    AND active = (SELECT s.active FROM public.staff s WHERE s.id = staff.id)
    AND NOT (status IS DISTINCT FROM (SELECT s.status FROM public.staff s WHERE s.id = staff.id))
  );
