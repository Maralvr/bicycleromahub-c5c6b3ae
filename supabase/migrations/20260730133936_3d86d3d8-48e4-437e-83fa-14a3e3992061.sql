CREATE OR REPLACE FUNCTION public.notify_additional_guide_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_shift public.shifts%ROWTYPE;
  v_body text;
BEGIN
  SELECT * INTO v_shift FROM public.shifts WHERE id = NEW.shift_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  v_body := COALESCE(v_shift.tour_name, 'Shift') || ' on ' || to_char(v_shift.date, 'Mon DD')
    || ' at ' || COALESCE(v_shift.start_time::text, '');
  INSERT INTO public.guide_notifications (staff_id, type, title, body, shift_id, link, read)
  VALUES (NEW.staff_id, 'assigned'::notification_type, 'Added as additional guide', v_body, NEW.shift_id,
          '/shifts?tab=mine&shift=' || NEW.shift_id::text, false);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_additional_guide_assignment ON public.shift_additional_guides;
CREATE TRIGGER trg_notify_additional_guide_assignment
AFTER INSERT ON public.shift_additional_guides
FOR EACH ROW EXECUTE FUNCTION public.notify_additional_guide_assignment();