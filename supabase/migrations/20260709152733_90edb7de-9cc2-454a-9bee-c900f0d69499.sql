DROP POLICY IF EXISTS "shifts_rental_staff_select" ON public.shifts;
CREATE POLICY "shifts_rental_staff_select" ON public.shifts FOR SELECT TO authenticated
USING (
  rental_point_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.rental_staff rs WHERE rs.profile_id = auth.uid())
);

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