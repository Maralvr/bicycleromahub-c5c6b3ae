
-- 1) Tighten rental_staff SELECT policy on shifts
DROP POLICY IF EXISTS shifts_rental_staff_select ON public.shifts;
CREATE POLICY shifts_rental_staff_select ON public.shifts
  FOR SELECT TO authenticated
  USING (
    rental_point_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.rental_staff rs
      WHERE rs.profile_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.staff_rental_points srp
      WHERE srp.user_id = auth.uid()
        AND srp.rental_point_id = shifts.rental_point_id
    )
  );

-- 2) Revoke anon execute on SECURITY DEFINER functions; grant only to authenticated
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon;', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role;', r.proname, r.args);
  END LOOP;
END $$;
