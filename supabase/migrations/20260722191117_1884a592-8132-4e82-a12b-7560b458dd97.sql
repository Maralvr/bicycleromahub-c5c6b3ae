CREATE OR REPLACE FUNCTION public.is_bokun_runs_allowed(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = _user_id
      AND lower(email) = 'marallvalipour@gmail.com'
  );
$$;

REVOKE ALL ON FUNCTION public.is_bokun_runs_allowed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_bokun_runs_allowed(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS bokun_runs_admin_all ON public.bokun_import_runs;
CREATE POLICY bokun_runs_admin_all ON public.bokun_import_runs
  FOR ALL
  TO authenticated
  USING (public.is_bokun_runs_allowed(auth.uid()))
  WITH CHECK (public.is_bokun_runs_allowed(auth.uid()));