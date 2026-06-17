
-- 1. New columns on rental_point_day_assignments
ALTER TABLE public.rental_point_day_assignments
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS pending_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.rental_point_day_assignments
  DROP CONSTRAINT IF EXISTS rpda_status_check;
ALTER TABLE public.rental_point_day_assignments
  ADD CONSTRAINT rpda_status_check CHECK (status IN ('pending','accepted'));

-- 2. Backfill existing rows as accepted so the current users aren't broken
UPDATE public.rental_point_day_assignments
   SET status='accepted', accepted_at=COALESCE(accepted_at, created_at)
 WHERE status='pending' AND pending_expires_at IS NULL;

-- 3. BEFORE INSERT trigger: new requests start pending with a 2h expiry
CREATE OR REPLACE FUNCTION public.set_rental_day_pending()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.status IS NULL OR NEW.status = 'pending' THEN
    NEW.status := 'pending';
    NEW.pending_expires_at := COALESCE(NEW.pending_expires_at, now() + interval '2 hours');
    NEW.accepted_at := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS rpda_set_pending ON public.rental_point_day_assignments;
CREATE TRIGGER rpda_set_pending
  BEFORE INSERT ON public.rental_point_day_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_rental_day_pending();

-- 4. Adjust assignment-created notification: reword as a request
CREATE OR REPLACE FUNCTION public.notify_rental_assignment()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_point_name text;
  v_body text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT name INTO v_point_name FROM public.rental_points WHERE id = NEW.rental_point_id;
    v_body := COALESCE(v_point_name, 'Rental point') || ' on ' || to_char(NEW.date, 'Mon DD')
              || ' — please accept or reject';
    INSERT INTO public.rental_staff_notifications
      (rental_staff_id, type, title, body, rental_point_id, date, link)
    VALUES (NEW.rental_staff_id, 'assigned', 'New rental-point day request', v_body,
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
END $$;

-- 5. Accept RPC
CREATE OR REPLACE FUNCTION public.accept_rental_day(_assignment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_rstaff_id uuid;
  v_owner uuid;
BEGIN
  SELECT id INTO v_rstaff_id FROM public.rental_staff WHERE profile_id = auth.uid() LIMIT 1;
  SELECT rental_staff_id INTO v_owner
    FROM public.rental_point_day_assignments WHERE id = _assignment_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;
  IF v_rstaff_id IS DISTINCT FROM v_owner AND NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.rental_point_day_assignments
     SET status='accepted', accepted_at=now(),
         pending_expires_at=NULL, rejection_reason=NULL
   WHERE id = _assignment_id;
END $$;

-- 6. Reject RPC: removes the assignment (frees the day) and notifies admins
CREATE OR REPLACE FUNCTION public.reject_rental_day(_assignment_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_rstaff_id uuid;
  v_owner uuid;
  v_point uuid;
  v_date date;
  v_name text;
  v_admin_staff uuid;
BEGIN
  SELECT id INTO v_rstaff_id FROM public.rental_staff WHERE profile_id = auth.uid() LIMIT 1;
  SELECT rental_staff_id, rental_point_id, date INTO v_owner, v_point, v_date
    FROM public.rental_point_day_assignments WHERE id = _assignment_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;
  IF v_rstaff_id IS DISTINCT FROM v_owner AND NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT name INTO v_name FROM public.rental_points WHERE id = v_point;

  -- Remove the assignment; notify_rental_assignment DELETE branch logs an "unassigned" entry for the rental staff
  DELETE FROM public.rental_point_day_assignments WHERE id = _assignment_id;

  -- Notify admins via the existing guide_notifications inbox
  FOR v_admin_staff IN
    SELECT s.id FROM public.staff s
    JOIN public.user_roles ur ON ur.user_id = s.profile_id
    WHERE ur.role = 'admin' AND s.active = true
  LOOP
    INSERT INTO public.guide_notifications (staff_id, type, title, body, link)
    VALUES (v_admin_staff, 'reassigned', 'Rental day rejected',
            COALESCE(v_name, 'Rental point') || ' on ' || to_char(v_date, 'Mon DD') ||
            CASE WHEN _reason IS NULL OR _reason = '' THEN ''
                 ELSE ' — ' || _reason END,
            '/rental-points?point=' || v_point::text);
  END LOOP;
END $$;

-- 7. Expire pending rental-day requests after 2h
CREATE OR REPLACE FUNCTION public.expire_rental_day_requests()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  r RECORD;
  v_count integer := 0;
  v_admin_staff uuid;
  v_name text;
BEGIN
  FOR r IN
    SELECT id, rental_staff_id, rental_point_id, date
      FROM public.rental_point_day_assignments
     WHERE status = 'pending'
       AND pending_expires_at IS NOT NULL
       AND pending_expires_at < now()
  LOOP
    SELECT name INTO v_name FROM public.rental_points WHERE id = r.rental_point_id;
    DELETE FROM public.rental_point_day_assignments WHERE id = r.id;

    FOR v_admin_staff IN
      SELECT s.id FROM public.staff s
      JOIN public.user_roles ur ON ur.user_id = s.profile_id
      WHERE ur.role = 'admin' AND s.active = true
    LOOP
      INSERT INTO public.guide_notifications (staff_id, type, title, body, link)
      VALUES (v_admin_staff, 'reassigned', 'Rental day request expired',
              COALESCE(v_name, 'Rental point') || ' on ' || to_char(r.date, 'Mon DD') ||
              ' — no response in 2h, please reassign',
              '/rental-points?point=' || r.rental_point_id::text);
    END LOOP;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

-- 8. Only send reminders for ACCEPTED assignments
CREATE OR REPLACE FUNCTION public.send_rental_point_reminders()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  r RECORD;
  v_count integer := 0;
  v_point_name text;
  v_body text;
  v_link text;
  v_count_bookings int;
BEGIN
  FOR r IN
    SELECT a.id, a.rental_staff_id, a.rental_point_id, a.date
      FROM public.rental_point_day_assignments a
     WHERE a.reminder_24h_sent_at IS NULL
       AND a.status = 'accepted'
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

  FOR r IN
    SELECT a.id, a.rental_staff_id, a.rental_point_id, a.date,
           MIN((a.date::timestamp + s.start_time) AT TIME ZONE 'Europe/Rome') AS first_start
      FROM public.rental_point_day_assignments a
      JOIN public.shifts s
        ON s.rental_point_id = a.rental_point_id AND s.date = a.date
     WHERE a.reminder_2h_sent_at IS NULL
       AND a.status = 'accepted'
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
END $$;

-- 9. RLS: let rental staff read shifts tied to their assigned rental point + day
DROP POLICY IF EXISTS "shifts_rental_staff_select" ON public.shifts;
CREATE POLICY "shifts_rental_staff_select" ON public.shifts FOR SELECT TO authenticated
USING (
  rental_point_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.rental_point_day_assignments a
      JOIN public.rental_staff rs ON rs.id = a.rental_staff_id
     WHERE rs.profile_id = auth.uid()
       AND a.rental_point_id = shifts.rental_point_id
       AND a.date = shifts.date
       AND a.status IN ('pending','accepted')
  )
);
