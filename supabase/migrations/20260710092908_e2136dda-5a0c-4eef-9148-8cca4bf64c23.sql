
DROP POLICY IF EXISTS "shifts_rental_staff_select" ON public.shifts;
CREATE POLICY "shifts_rental_staff_select" ON public.shifts FOR SELECT TO authenticated
USING (
  rental_point_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.rental_staff rs WHERE rs.profile_id = auth.uid())
);

-- Ensure has_role remains callable by anon (in case earlier sweep revoked it)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;
