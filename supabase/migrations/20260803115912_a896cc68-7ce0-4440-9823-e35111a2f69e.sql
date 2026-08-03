CREATE OR REPLACE FUNCTION public.is_rental_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rental_staff WHERE profile_id = _user_id
  )
$$;

REVOKE ALL ON FUNCTION public.is_rental_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_rental_staff(uuid) TO authenticated, service_role;

-- Replace the self-referential policy (rental_staff policy selecting from
-- rental_staff => "infinite recursion detected in policy" 42P17, which also
-- broke every shifts read via shifts_rental_staff_select's EXISTS subquery).
DROP POLICY IF EXISTS rstaff_rental_staff_select_all ON public.rental_staff;
CREATE POLICY rstaff_rental_staff_select_all
  ON public.rental_staff FOR SELECT TO authenticated
  USING (public.is_rental_staff(auth.uid()));

DROP POLICY IF EXISTS shifts_rental_staff_select ON public.shifts;
CREATE POLICY shifts_rental_staff_select
  ON public.shifts FOR SELECT TO authenticated
  USING (rental_point_id IS NOT NULL AND public.is_rental_staff(auth.uid()));