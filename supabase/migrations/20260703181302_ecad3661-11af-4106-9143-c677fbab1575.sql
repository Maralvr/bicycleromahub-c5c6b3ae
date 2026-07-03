DO $$
BEGIN
  -- Rental users should authenticate through user_roles.role = 'rental_staff'
  -- and the rental_staff table. They must not also be linked as guide/staff
  -- users through profiles.staff_id or staff.profile_id.
  UPDATE public.profiles p
  SET staff_id = NULL
  WHERE EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p.id
      AND ur.role = 'rental_staff'::public.app_role
  )
  AND NOT public.has_role(p.id, 'admin'::public.app_role)
  AND p.staff_id IS NOT NULL;

  UPDATE public.staff s
  SET profile_id = NULL
  WHERE s.profile_id IS NOT NULL
    AND s.role = 'rental'::public.staff_role
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = s.profile_id
        AND ur.role = 'rental_staff'::public.app_role
    )
    AND NOT public.has_role(s.profile_id, 'admin'::public.app_role);

  DELETE FROM public.user_roles ur
  WHERE ur.role = 'staff'::public.app_role
    AND EXISTS (
      SELECT 1
      FROM public.user_roles rental_ur
      WHERE rental_ur.user_id = ur.user_id
        AND rental_ur.role = 'rental_staff'::public.app_role
    )
    AND NOT public.has_role(ur.user_id, 'admin'::public.app_role);
END $$;