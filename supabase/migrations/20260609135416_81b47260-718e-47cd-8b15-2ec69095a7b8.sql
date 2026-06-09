
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_2h_sent_at timestamptz;

CREATE OR REPLACE FUNCTION public.send_shift_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_count integer := 0;
  v_start_ts timestamptz;
  v_body text;
  v_link text;
  v_when text;
BEGIN
  -- 24h reminders: shift starts between ~2h and ~24h from now, not yet sent
  FOR r IN
    SELECT s.id, s.assigned_staff_id, s.tour_name, s.date, s.start_time,
           ((s.date::timestamp + s.start_time) AT TIME ZONE 'Europe/Rome') AS start_ts
      FROM public.shifts s
     WHERE s.status = 'accepted'
       AND s.assigned_staff_id IS NOT NULL
       AND s.reminder_24h_sent_at IS NULL
       AND ((s.date::timestamp + s.start_time) AT TIME ZONE 'Europe/Rome') > now() + interval '2 hours'
       AND ((s.date::timestamp + s.start_time) AT TIME ZONE 'Europe/Rome') <= now() + interval '24 hours'
  LOOP
    v_when := to_char(r.start_time, 'HH24:MI');
    v_body := 'Reminder: ' || COALESCE(r.tour_name, 'Shift') || ' tomorrow at ' || v_when;
    v_link := '/shifts?tab=mine&shift=' || r.id::text;

    INSERT INTO public.guide_notifications (staff_id, type, title, body, shift_id, link, read)
    VALUES (r.assigned_staff_id, 'reminder', 'Tour tomorrow', v_body, r.id, v_link, false);

    UPDATE public.shifts SET reminder_24h_sent_at = now() WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;

  -- 2h reminders: shift starts within the next ~2h, not yet sent
  FOR r IN
    SELECT s.id, s.assigned_staff_id, s.tour_name, s.date, s.start_time,
           ((s.date::timestamp + s.start_time) AT TIME ZONE 'Europe/Rome') AS start_ts
      FROM public.shifts s
     WHERE s.status = 'accepted'
       AND s.assigned_staff_id IS NOT NULL
       AND s.reminder_2h_sent_at IS NULL
       AND ((s.date::timestamp + s.start_time) AT TIME ZONE 'Europe/Rome') > now()
       AND ((s.date::timestamp + s.start_time) AT TIME ZONE 'Europe/Rome') <= now() + interval '2 hours'
  LOOP
    v_when := to_char(r.start_time, 'HH24:MI');
    v_body := 'Starting soon: ' || COALESCE(r.tour_name, 'Shift') || ' at ' || v_when;
    v_link := '/shifts?tab=mine&shift=' || r.id::text;

    INSERT INTO public.guide_notifications (staff_id, type, title, body, shift_id, link, read)
    VALUES (r.assigned_staff_id, 'reminder', 'Tour starting soon', v_body, r.id, v_link, false);

    UPDATE public.shifts SET reminder_2h_sent_at = now() WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Clear reminder timestamps if a shift is reassigned/unassigned/rejected so the new guide gets fresh reminders
CREATE OR REPLACE FUNCTION public.reset_shift_reminders_on_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_staff_id IS DISTINCT FROM OLD.assigned_staff_id
     OR NEW.date IS DISTINCT FROM OLD.date
     OR NEW.start_time IS DISTINCT FROM OLD.start_time THEN
    NEW.reminder_24h_sent_at := NULL;
    NEW.reminder_2h_sent_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shifts_reset_reminders ON public.shifts;
CREATE TRIGGER shifts_reset_reminders
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_shift_reminders_on_change();
