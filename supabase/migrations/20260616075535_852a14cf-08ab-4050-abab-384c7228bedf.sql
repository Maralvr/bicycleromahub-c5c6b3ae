
-- 1. Extend role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'rental_staff';

-- 2. rental_staff table
CREATE TABLE IF NOT EXISTS public.rental_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text,
  phone text,
  avatar text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS rental_staff_email_lower_idx
  ON public.rental_staff (lower(email)) WHERE email IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_staff TO authenticated;
GRANT ALL ON public.rental_staff TO service_role;
ALTER TABLE public.rental_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rstaff_admin_all" ON public.rental_staff
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "rstaff_self_select" ON public.rental_staff
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE TRIGGER rental_staff_updated_at
  BEFORE UPDATE ON public.rental_staff
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. rental_point_day_assignments
CREATE TABLE IF NOT EXISTS public.rental_point_day_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_point_id uuid NOT NULL REFERENCES public.rental_points(id) ON DELETE CASCADE,
  rental_staff_id uuid NOT NULL REFERENCES public.rental_staff(id) ON DELETE CASCADE,
  date date NOT NULL,
  notes text,
  created_by uuid,
  reminder_24h_sent_at timestamptz,
  reminder_2h_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rental_point_id, rental_staff_id, date)
);
CREATE INDEX IF NOT EXISTS rpda_point_date_idx ON public.rental_point_day_assignments (rental_point_id, date);
CREATE INDEX IF NOT EXISTS rpda_staff_date_idx ON public.rental_point_day_assignments (rental_staff_id, date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_point_day_assignments TO authenticated;
GRANT ALL ON public.rental_point_day_assignments TO service_role;
ALTER TABLE public.rental_point_day_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rpda_admin_all" ON public.rental_point_day_assignments
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "rpda_self_select" ON public.rental_point_day_assignments
  FOR SELECT TO authenticated
  USING (rental_staff_id IN (
    SELECT id FROM public.rental_staff WHERE profile_id = auth.uid()
  ));

CREATE TRIGGER rpda_updated_at
  BEFORE UPDATE ON public.rental_point_day_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. rental_staff_notifications
CREATE TABLE IF NOT EXISTS public.rental_staff_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_staff_id uuid NOT NULL REFERENCES public.rental_staff(id) ON DELETE CASCADE,
  type public.notification_type NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  rental_point_id uuid REFERENCES public.rental_points(id) ON DELETE SET NULL,
  date date,
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX IF NOT EXISTS rsnotif_staff_idx ON public.rental_staff_notifications (rental_staff_id, archived_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_staff_notifications TO authenticated;
GRANT ALL ON public.rental_staff_notifications TO service_role;
ALTER TABLE public.rental_staff_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rsnotif_admin_all" ON public.rental_staff_notifications
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "rsnotif_select" ON public.rental_staff_notifications
  FOR SELECT TO authenticated
  USING (rental_staff_id IN (
    SELECT id FROM public.rental_staff WHERE profile_id = auth.uid()
  ));

CREATE POLICY "rsnotif_self_update" ON public.rental_staff_notifications
  FOR UPDATE TO authenticated
  USING (rental_staff_id IN (
    SELECT id FROM public.rental_staff WHERE profile_id = auth.uid()
  ))
  WITH CHECK (rental_staff_id IN (
    SELECT id FROM public.rental_staff WHERE profile_id = auth.uid()
  ));

-- 5. Trigger: write notifications on assign / unassign
CREATE OR REPLACE FUNCTION public.notify_rental_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_point_name text;
  v_body text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT name INTO v_point_name FROM public.rental_points WHERE id = NEW.rental_point_id;
    v_body := COALESCE(v_point_name, 'Rental point') || ' on ' || to_char(NEW.date, 'Mon DD');
    INSERT INTO public.rental_staff_notifications
      (rental_staff_id, type, title, body, rental_point_id, date, link)
    VALUES (NEW.rental_staff_id, 'assigned', 'New rental-point day assigned', v_body,
            NEW.rental_point_id, NEW.date, '/shifts?tab=mine&rental_day=' || NEW.id::text);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT name INTO v_point_name FROM public.rental_points WHERE id = OLD.rental_point_id;
    v_body := COALESCE(v_point_name, 'Rental point') || ' on ' || to_char(OLD.date, 'Mon DD');
    INSERT INTO public.rental_staff_notifications
      (rental_staff_id, type, title, body, rental_point_id, date)
    VALUES (OLD.rental_staff_id, 'unassigned', 'Rental-point day removed', v_body,
            OLD.rental_point_id, OLD.date);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS rpda_notify_ins ON public.rental_point_day_assignments;
CREATE TRIGGER rpda_notify_ins
  AFTER INSERT ON public.rental_point_day_assignments
  FOR EACH ROW EXECUTE FUNCTION public.notify_rental_assignment();

DROP TRIGGER IF EXISTS rpda_notify_del ON public.rental_point_day_assignments;
CREATE TRIGGER rpda_notify_del
  AFTER DELETE ON public.rental_point_day_assignments
  FOR EACH ROW EXECUTE FUNCTION public.notify_rental_assignment();

-- 6. Extend handle_new_user: link rental_staff by email if present
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_display text;
  v_initials text;
  v_rstaff_id uuid;
BEGIN
  v_display := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'User');
  v_initials := upper(substr(v_display, 1, 2));

  -- If a rental_staff row exists for this email, link and grant rental_staff role.
  SELECT id INTO v_rstaff_id
    FROM public.rental_staff
   WHERE email IS NOT NULL AND lower(email) = lower(new.email)
   LIMIT 1;

  IF v_rstaff_id IS NOT NULL THEN
    UPDATE public.rental_staff
       SET profile_id = new.id,
           name = COALESCE(NULLIF(name, ''), v_display),
           avatar = COALESCE(NULLIF(avatar, ''), v_initials)
     WHERE id = v_rstaff_id;

    INSERT INTO public.profiles (id, display_name, avatar_initials, staff_id)
    VALUES (new.id, v_display, v_initials, NULL);

    INSERT INTO public.user_roles (user_id, role)
    VALUES (new.id, 'rental_staff')
    ON CONFLICT DO NOTHING;

    RETURN new;
  END IF;

  -- Default: create a tour-guide staff entry.
  INSERT INTO public.staff (profile_id, name, avatar, role, email)
  VALUES (new.id, v_display, v_initials, 'guide', new.email)
  RETURNING id INTO v_staff_id;

  INSERT INTO public.profiles (id, display_name, avatar_initials, staff_id)
  VALUES (new.id, v_display, v_initials, v_staff_id);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'staff');

  RETURN new;
END;
$$;

-- 7. Reminder function for rental-point days
CREATE OR REPLACE FUNCTION public.send_rental_point_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_count integer := 0;
  v_point_name text;
  v_body text;
  v_link text;
  v_count_bookings int;
BEGIN
  -- 24h reminders: assignments for tomorrow not yet reminded
  FOR r IN
    SELECT a.id, a.rental_staff_id, a.rental_point_id, a.date
      FROM public.rental_point_day_assignments a
     WHERE a.reminder_24h_sent_at IS NULL
       AND a.date = (now() AT TIME ZONE 'Europe/Rome')::date + 1
  LOOP
    SELECT name INTO v_point_name FROM public.rental_points WHERE id = r.rental_point_id;
    SELECT COUNT(*) INTO v_count_bookings FROM public.shifts s
      WHERE s.rental_point_id = r.rental_point_id AND s.date = r.date;
    v_body := COALESCE(v_point_name, 'Rental point') || ' tomorrow — ' || v_count_bookings || ' booking(s)';
    v_link := '/shifts?tab=mine&rental_day=' || r.id::text;
    INSERT INTO public.rental_staff_notifications
      (rental_staff_id, type, title, body, rental_point_id, date, link)
    VALUES (r.rental_staff_id, 'reminder', 'Rental day tomorrow', v_body,
            r.rental_point_id, r.date, v_link);
    UPDATE public.rental_point_day_assignments
       SET reminder_24h_sent_at = now() WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;

  -- 2h-before-first-booking reminder: today, earliest shift starts within next 2h
  FOR r IN
    SELECT a.id, a.rental_staff_id, a.rental_point_id, a.date,
           MIN((a.date::timestamp + s.start_time) AT TIME ZONE 'Europe/Rome') AS first_start
      FROM public.rental_point_day_assignments a
      JOIN public.shifts s
        ON s.rental_point_id = a.rental_point_id AND s.date = a.date
     WHERE a.reminder_2h_sent_at IS NULL
       AND a.date = (now() AT TIME ZONE 'Europe/Rome')::date
     GROUP BY a.id, a.rental_staff_id, a.rental_point_id, a.date
    HAVING MIN((a.date::timestamp + s.start_time) AT TIME ZONE 'Europe/Rome') > now()
       AND MIN((a.date::timestamp + s.start_time) AT TIME ZONE 'Europe/Rome') <= now() + interval '2 hours'
  LOOP
    SELECT name INTO v_point_name FROM public.rental_points WHERE id = r.rental_point_id;
    v_body := COALESCE(v_point_name, 'Rental point') || ' — first booking at ' || to_char(r.first_start AT TIME ZONE 'Europe/Rome', 'HH24:MI');
    v_link := '/shifts?tab=mine&rental_day=' || r.id::text;
    INSERT INTO public.rental_staff_notifications
      (rental_staff_id, type, title, body, rental_point_id, date, link)
    VALUES (r.rental_staff_id, 'reminder', 'Rental day starting soon', v_body,
            r.rental_point_id, r.date, v_link);
    UPDATE public.rental_point_day_assignments
       SET reminder_2h_sent_at = now() WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
