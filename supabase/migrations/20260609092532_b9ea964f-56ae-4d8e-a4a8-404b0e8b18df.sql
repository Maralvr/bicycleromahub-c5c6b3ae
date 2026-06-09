
CREATE OR REPLACE FUNCTION public.notify_shift_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_body text;
  v_date_label text;
BEGIN
  IF NEW.assigned_staff_id IS NOT DISTINCT FROM OLD.assigned_staff_id THEN
    RETURN NEW;
  END IF;

  v_date_label := to_char(NEW.date, 'Mon DD');
  v_body := COALESCE(NEW.tour_name, 'Shift') || ' on ' || v_date_label
    || ' at ' || COALESCE(NEW.start_time::text, '');

  -- Newly assigned guide (or reassignment target)
  IF NEW.assigned_staff_id IS NOT NULL THEN
    INSERT INTO public.guide_notifications (staff_id, type, title, body, shift_id, link, read)
    VALUES (
      NEW.assigned_staff_id,
      CASE WHEN OLD.assigned_staff_id IS NOT NULL THEN 'reassigned' ELSE 'assigned' END,
      CASE WHEN OLD.assigned_staff_id IS NOT NULL THEN 'Shift reassigned to you' ELSE 'New shift assigned' END,
      v_body,
      NEW.id,
      '/shifts',
      false
    );
  END IF;

  -- Previously assigned guide (when reassigned away or unassigned)
  IF OLD.assigned_staff_id IS NOT NULL
     AND OLD.assigned_staff_id IS DISTINCT FROM NEW.assigned_staff_id THEN
    INSERT INTO public.guide_notifications (staff_id, type, title, body, shift_id, link, read)
    VALUES (
      OLD.assigned_staff_id,
      'unassigned',
      'Shift removed from your schedule',
      v_body,
      NEW.id,
      '/shifts',
      false
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_shift_assignment ON public.shifts;
CREATE TRIGGER trg_notify_shift_assignment
AFTER UPDATE OF assigned_staff_id ON public.shifts
FOR EACH ROW
EXECUTE FUNCTION public.notify_shift_assignment();

-- Also fire on insert when a shift is created already assigned
CREATE OR REPLACE FUNCTION public.notify_shift_assignment_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_body text;
BEGIN
  IF NEW.assigned_staff_id IS NULL THEN
    RETURN NEW;
  END IF;
  v_body := COALESCE(NEW.tour_name, 'Shift') || ' on ' || to_char(NEW.date, 'Mon DD')
    || ' at ' || COALESCE(NEW.start_time::text, '');
  INSERT INTO public.guide_notifications (staff_id, type, title, body, shift_id, link, read)
  VALUES (NEW.assigned_staff_id, 'assigned', 'New shift assigned', v_body, NEW.id, '/shifts', false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_shift_assignment_insert ON public.shifts;
CREATE TRIGGER trg_notify_shift_assignment_insert
AFTER INSERT ON public.shifts
FOR EACH ROW
EXECUTE FUNCTION public.notify_shift_assignment_on_insert();
