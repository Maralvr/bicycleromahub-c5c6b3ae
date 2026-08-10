CREATE OR REPLACE FUNCTION public.email_on_guide_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_name text;
  v_greet text;
  v_dedupe text;
  v_kind text;
  v_assigned uuid;
  v_link text;
  v_sender text;
  v_subject text;
BEGIN
  -- Rental-day accept/reject already emails admins via
  -- email_admins_on_rental_day_response(); keep the in-app bell only.
  IF NEW.title IN ('Rental day rejected', 'Rental day accepted') THEN
    RETURN NEW;
  END IF;

  SELECT email, name INTO v_email, v_name FROM public.staff WHERE id = NEW.staff_id;
  IF v_email IS NULL THEN RETURN NEW; END IF;

  v_greet := split_part(COALESCE(NULLIF(btrim(v_name), ''), 'there'), '@', 1);
  v_greet := split_part(replace(replace(v_greet, '_', ' '), '.', ' '), ' ', 1);
  v_greet := initcap(v_greet);

  v_dedupe := 'notif:' || NEW.id::text;

  IF NEW.type = 'broadcast' THEN
    IF NEW.field_update_id IS NOT NULL THEN
      SELECT p.display_name INTO v_sender
      FROM public.field_updates fu
      LEFT JOIN public.profiles p ON p.id = fu.author_id
      WHERE fu.id = NEW.field_update_id;
    END IF;
    v_subject := 'Message from ' || COALESCE(v_sender, 'the team');

    PERFORM public.email_outbox_enqueue(
      v_email, v_name,
      v_subject,
      v_subject,
      ARRAY[
        NEW.body,
        '',
        '— ' || COALESCE(v_sender, 'Bicycle Roma Hub')
      ],
      'guide_notification:broadcast',
      v_dedupe
    );
    RETURN NEW;
  END IF;

  IF NEW.shift_id IS NOT NULL AND NEW.type IN ('assigned', 'reassigned', 'unassigned', 'shift_cancelled') THEN
    SELECT assigned_staff_id INTO v_assigned FROM public.shifts WHERE id = NEW.shift_id;
    IF v_assigned IS NOT DISTINCT FROM NEW.staff_id OR NEW.type IN ('unassigned', 'shift_cancelled') THEN
      v_kind := CASE NEW.type::text
                  WHEN 'reassigned' THEN 'assigned'
                  WHEN 'shift_cancelled' THEN 'cancelled'
                  ELSE NEW.type::text END;
      v_dedupe := 'shift:' || NEW.shift_id::text || ':' || NEW.staff_id::text || ':' || v_kind;
    END IF;
  END IF;

  v_link := 'https://bicycleromahub.lovable.app' || COALESCE(NEW.link, '/shifts');

  PERFORM public.email_outbox_enqueue(
    v_email, v_name,
    NEW.title,
    NEW.title,
    ARRAY[
      'Hi ' || v_greet || ',',
      '',
      NEW.body,
      '',
      'Open the app to see the details: ' || v_link
    ],
    'guide_notification:' || NEW.type::text,
    v_dedupe
  );
  RETURN NEW;
END $function$;