CREATE OR REPLACE FUNCTION public.is_staff_assigned_to_rental_shift(_staff_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.shifts s
      JOIN public.rental_point_day_assignments a
        ON a.rental_point_id = s.rental_point_id
       AND a.date = s.date
      JOIN public.rental_staff rs
        ON rs.id = a.rental_staff_id
     WHERE s.assigned_staff_id = _staff_id
       AND s.rental_point_id IS NOT NULL
       AND rs.profile_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_staff_assigned_to_rental_shift(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff_assigned_to_rental_shift(uuid) TO authenticated;