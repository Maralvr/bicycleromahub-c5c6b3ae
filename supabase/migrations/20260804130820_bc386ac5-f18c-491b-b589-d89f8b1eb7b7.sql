-- 1. Cancellation columns
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid;

ALTER TABLE public.rental_point_day_assignments
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid;

CREATE INDEX IF NOT EXISTS shifts_cancelled_at_idx ON public.shifts (cancelled_at);

-- 2. Cancelled bookings must not block guide availability
CREATE OR REPLACE FUNCTION public.guide_conflicting_shift(_staff_id uuid, _date date, _start time without time zone, _end time without time zone, _exclude_shift_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT s.tour_name, s.bokun_product_id
      FROM public.shifts s
     WHERE s.id = _exclude_shift_id
  ), committed AS (
    SELECT s.id, s.tour_name, s.bokun_product_id, s.date, s.start_time, s.end_time
      FROM public.shifts s
     WHERE s.assigned_staff_id = _staff_id
       AND s.status IN ('pending', 'accepted')
       AND s.cancelled_at IS NULL
    UNION
    SELECT s.id, s.tour_name, s.bokun_product_id, s.date, s.start_time, s.end_time
      FROM public.shift_additional_guides ag
      JOIN public.shifts s ON s.id = ag.shift_id
     WHERE ag.staff_id = _staff_id
       AND ag.status IN ('pending', 'accepted')
       AND s.cancelled_at IS NULL
  )
  SELECT c.id
    FROM committed c
    LEFT JOIN me ON true
   WHERE c.id IS DISTINCT FROM _exclude_shift_id
     AND c.date = _date
     AND c.start_time < _end
     AND _start < c.end_time
     AND NOT (
       c.start_time = _start
       AND c.end_time = _end
       AND (
         (me.bokun_product_id IS NOT NULL AND c.bokun_product_id = me.bokun_product_id)
         OR (me.tour_name IS NOT NULL AND c.tour_name = me.tour_name)
       )
     )
   ORDER BY c.start_time
   LIMIT 1
$function$;

-- 3. Admin cancels a rental day (soft) + notifies the staff member
CREATE OR REPLACE FUNCTION public.cancel_rental_day(_assignment_id uuid, _reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rstaff_id uuid;
  v_point uuid;
  v_date date;
  v_name text;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can cancel rental days';
  END IF;

  SELECT rental_staff_id, rental_point_id, date
    INTO v_rstaff_id, v_point, v_date
    FROM public.rental_point_day_assignments
   WHERE id = _assignment_id;

  IF v_rstaff_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  SELECT name INTO v_name FROM public.rental_points WHERE id = v_point;

  UPDATE public.rental_point_day_assignments
     SET status = 'cancelled',
         cancelled_at = now(),
         cancelled_reason = NULLIF(trim(coalesce(_reason, '')), ''),
         cancelled_by = auth.uid(),
         pending_expires_at = NULL
   WHERE id = _assignment_id;

  INSERT INTO public.rental_staff_notifications
    (rental_staff_id, type, title, body, rental_point_id, date, link)
  VALUES (v_rstaff_id, 'unassigned', 'Rental day cancelled',
          COALESCE(v_name, 'Rental point') || ' on ' || to_char(v_date, 'Mon DD') ||
          CASE WHEN _reason IS NULL OR trim(_reason) = '' THEN '' ELSE ' — ' || _reason END,
          v_point, v_date, '/shifts?tab=mine');
END $function$;

REVOKE ALL ON FUNCTION public.cancel_rental_day(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_rental_day(uuid, text) TO authenticated;

-- 4. Notify rental staff when a booking at their point gets cancelled
CREATE OR REPLACE FUNCTION public.notify_rental_staff_shift_cancelled()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
BEGIN
  IF NEW.cancelled_at IS NULL OR OLD.cancelled_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.rental_point_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT a.rental_staff_id, rp.name AS point_name
      FROM public.rental_point_day_assignments a
      JOIN public.rental_points rp ON rp.id = a.rental_point_id
     WHERE a.rental_point_id = NEW.rental_point_id
       AND a.date = NEW.date
       AND a.status IN ('pending', 'accepted')
  LOOP
    INSERT INTO public.rental_staff_notifications
      (rental_staff_id, type, title, body, rental_point_id, date, link)
    VALUES (r.rental_staff_id, 'shift_cancelled', 'Booking cancelled',
            COALESCE(NEW.tour_name, 'Booking') || ' on ' || to_char(NEW.date, 'Mon DD') ||
            ' at ' || COALESCE(NEW.start_time::text, '') || ' was cancelled',
            NEW.rental_point_id, NEW.date, '/shifts?tab=mine');
  END LOOP;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_notify_rental_staff_shift_cancelled ON public.shifts;
CREATE TRIGGER trg_notify_rental_staff_shift_cancelled
  AFTER UPDATE OF cancelled_at ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.notify_rental_staff_shift_cancelled();

-- 5. Realtime for day assignments
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rental_point_day_assignments;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;