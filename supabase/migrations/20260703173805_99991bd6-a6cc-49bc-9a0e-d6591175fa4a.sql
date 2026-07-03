-- Normalize existing rental users so the UI role and auth role do not conflict.
-- UI/job role: staff.role = 'rental'
-- Auth/access role: user_roles.role = 'rental_staff'

DO $$
DECLARE
  r RECORD;
  v_rental_staff_id uuid;
BEGIN
  FOR r IN
    SELECT
      p.id AS profile_id,
      p.display_name,
      p.avatar_initials,
      s.id AS staff_id,
      s.name AS staff_name,
      s.email AS staff_email,
      s.avatar AS staff_avatar,
      s.phone AS staff_phone,
      s.active AS staff_active
    FROM public.staff s
    JOIN public.profiles p ON p.id = s.profile_id
    WHERE s.role = 'rental'
      AND NOT public.has_role(p.id, 'admin'::public.app_role)
  LOOP
    SELECT id INTO v_rental_staff_id
    FROM public.rental_staff
    WHERE profile_id = r.profile_id
       OR (email IS NOT NULL AND r.staff_email IS NOT NULL AND lower(email) = lower(r.staff_email))
    ORDER BY CASE WHEN profile_id = r.profile_id THEN 0 ELSE 1 END
    LIMIT 1;

    IF v_rental_staff_id IS NULL THEN
      INSERT INTO public.rental_staff (profile_id, name, email, phone, avatar, active)
      VALUES (
        r.profile_id,
        COALESCE(NULLIF(r.staff_name, ''), NULLIF(r.display_name, ''), 'Rental staff'),
        r.staff_email,
        r.staff_phone,
        COALESCE(NULLIF(r.staff_avatar, ''), NULLIF(r.avatar_initials, ''), 'RS'),
        COALESCE(r.staff_active, true)
      )
      RETURNING id INTO v_rental_staff_id;
    ELSE
      UPDATE public.rental_staff
      SET profile_id = r.profile_id,
          name = COALESCE(NULLIF(name, ''), NULLIF(r.staff_name, ''), NULLIF(r.display_name, ''), 'Rental staff'),
          email = COALESCE(email, r.staff_email),
          phone = COALESCE(phone, r.staff_phone),
          avatar = COALESCE(NULLIF(avatar, ''), NULLIF(r.staff_avatar, ''), NULLIF(r.avatar_initials, ''), 'RS'),
          active = COALESCE(active, r.staff_active, true)
      WHERE id = v_rental_staff_id;
    END IF;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (r.profile_id, 'rental_staff'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    DELETE FROM public.user_roles
    WHERE user_id = r.profile_id
      AND role = 'staff'::public.app_role;

    UPDATE public.profiles
    SET staff_id = NULL
    WHERE id = r.profile_id;
  END LOOP;
END $$;