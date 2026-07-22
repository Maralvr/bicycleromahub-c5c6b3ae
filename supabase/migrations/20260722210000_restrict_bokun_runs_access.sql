-- Bokun Runs (bokun_import_runs) is a diagnostics page for the Bokun sync
-- pipeline. It should be visible to exactly one account, not every admin.
-- Client-side route guards (see src/lib/require-admin.ts /
-- useRequireBokunRunsAccess) hide the page and nav item, but that is not a
-- real security boundary on its own -- enforce it here too, at the RLS
-- layer, so it holds even if someone hits the table another way.
--
-- Keep the email below in sync with BOKUN_RUNS_ALLOWED_EMAIL in
-- src/lib/bokun-runs-access.ts (SQL can't import a TS constant).

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

DROP POLICY IF EXISTS "bokun_runs_admin_all" ON public.bokun_import_runs;

CREATE POLICY "bokun_runs_admin_all" ON public.bokun_import_runs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND public.is_bokun_runs_allowed(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND public.is_bokun_runs_allowed(auth.uid()));
