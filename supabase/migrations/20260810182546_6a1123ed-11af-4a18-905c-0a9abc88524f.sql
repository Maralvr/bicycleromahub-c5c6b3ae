-- Shared detail block used by every shift-related email. Never includes `rate`
-- (customer payment rate is admin-only).
CREATE OR REPLACE FUNCTION public.shift_email_lines(_shift_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.shifts%ROWTYPE;
  v_lines text[] := '{}';
  v_point text;
  v_guide text;
  v_addl text;
  v_pax int;
BEGIN
  SELECT * INTO s FROM public.shifts WHERE id = _shift_id;
  IF NOT FOUND THEN RETURN v_lines; END IF;

  SELECT name INTO v_point FROM public.rental_points WHERE id = s.rental_point_id;
  SELECT name INTO v_guide FROM public.staff WHERE id = s.assigned_staff_id;
  SELECT string_agg(st.name, ', ') INTO v_addl
    FROM public.shift_additional_guides ag
    JOIN public.staff st ON st.id = ag.staff_id
   WHERE ag.shift_id = s.id AND ag.status <> 'rejected';

  v_pax := COALESCE(s.adults,0) + COALESCE(s.teens,0) + COALESCE(s.infants,0);

  v_lines := v_lines || ('Tour: ' || COALESCE(s.tour_name, '-'));
  v_lines := v_lines || ('Date: ' || to_char(s.date, 'Dy DD Mon YYYY'));
  v_lines := v_lines || ('Time: ' || COALESCE(to_char(s.start_time, 'HH24:MI'), '-') ||
                         COALESCE(' - ' || to_char(s.end_time, 'HH24:MI'), ''));
  v_lines := v_lines || ('Meeting point: ' || COALESCE(NULLIF(s.meeting_point, ''), '-'));
  IF v_point IS NOT NULL THEN
    v_lines := v_lines || ('Rental point: ' || v_point);
  END IF;
  IF NULLIF(s.rate_title, '') IS NOT NULL THEN
    v_lines := v_lines || ('Language / rate name: ' || s.rate_title);
  END IF;
  IF v_pax > 0 OR COALESCE(s.trailers,0) > 0 THEN
    v_lines := v_lines || ('Guests: ' || v_pax ||
      ' (' || COALESCE(s.adults,0) || ' adults' ||
      CASE WHEN COALESCE(s.teens,0) > 0 THEN ', ' || s.teens || ' teens' ELSE '' END ||
      CASE WHEN COALESCE(s.infants,0) > 0 THEN ', ' || s.infants || ' infants' ELSE '' END || ')' ||
      CASE WHEN COALESCE(s.trailers,0) > 0 THEN ' - ' || s.trailers || ' trailer(s)' ELSE '' END);
  END IF;
  IF NULLIF(s.customer_name, '') IS NOT NULL THEN
    v_lines := v_lines || ('Customer: ' || s.customer_name ||
      COALESCE(' - ' || NULLIF(s.customer_phone, ''), ''));
  END IF;
  IF COALESCE(NULLIF(s.booking_id, ''), NULLIF(s.channel_booking_ref, ''),
              NULLIF(s.external_booking_ref, '')) IS NOT NULL THEN
    v_lines := v_lines || ('Booking ref: ' || COALESCE(NULLIF(s.booking_id, ''),
      NULLIF(s.channel_booking_ref, ''), NULLIF(s.external_booking_ref, '')));
  END IF;
  IF v_guide IS NOT NULL THEN
    v_lines := v_lines || ('Guide: ' || v_guide);
  END IF;
  IF v_addl IS NOT NULL THEN
    v_lines := v_lines || ('Additional guides: ' || v_addl);
  END IF;
  IF NULLIF(s.operations_notes, '') IS NOT NULL THEN
    v_lines := v_lines || ('Notes: ' || s.operations_notes);
  END IF;
  IF s.cancelled_at IS NOT NULL THEN
    v_lines := v_lines || ('Status: cancelled' || COALESCE(' - ' || NULLIF(s.cancelled_reason, ''), ''));
  END IF;
  IF s.no_show THEN
    v_lines := v_lines || ('Flagged as no-show' || COALESCE(' - ' || NULLIF(s.no_show_notes, ''), ''));
  END IF;

  v_lines := v_lines || ARRAY['',
    'Open in the app: https://bicycleromahub.lovable.app/shifts?tab=mine&shift=' || s.id::text];
  RETURN v_lines;
END $$;

REVOKE ALL ON FUNCTION public.shift_email_lines(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shift_email_lines(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.shift_email_lines(uuid) FROM authenticated;

-- Shared detail block for a rental point day.
CREATE OR REPLACE FUNCTION public.rental_day_email_lines(_point_id uuid, _date date)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.rental_points%ROWTYPE;
  v_lines text[] := '{}';
  v_bookings int;
  v_first time;
  v_last time;
  a RECORD;
BEGIN
  SELECT * INTO p FROM public.rental_points WHERE id = _point_id;

  v_lines := v_lines || ('Rental point: ' || COALESCE(p.name, '-'));
  IF COALESCE(NULLIF(p.address, ''), NULLIF(p.city, '')) IS NOT NULL THEN
    v_lines := v_lines || ('Address: ' || concat_ws(', ', NULLIF(p.address, ''), NULLIF(p.city, '')));
  END IF;
  IF NULLIF(p.phone, '') IS NOT NULL THEN
    v_lines := v_lines || ('Point phone: ' || p.phone);
  END IF;
  IF _date IS NOT NULL THEN
    v_lines := v_lines || ('Date: ' || to_char(_date, 'Dy DD Mon YYYY'));

    SELECT count(*), min(s.start_time), max(s.end_time)
      INTO v_bookings, v_first, v_last
      FROM public.shifts s
     WHERE s.rental_point_id = _point_id AND s.date = _date AND s.cancelled_at IS NULL;

    v_lines := v_lines || ('Bookings that day: ' || COALESCE(v_bookings, 0));
    IF v_first IS NOT NULL THEN
      v_lines := v_lines || ('First booking: ' || to_char(v_first, 'HH24:MI') ||
                             COALESCE(' - last ends ' || to_char(v_last, 'HH24:MI'), ''));
    END IF;

    SELECT * INTO a FROM public.rental_point_day_assignments
     WHERE rental_point_id = _point_id AND date = _date
     ORDER BY updated_at DESC LIMIT 1;
    IF a.id IS NOT NULL THEN
      IF a.shift_start_time IS NOT NULL THEN
        v_lines := v_lines || ('Your shift: ' || to_char(a.shift_start_time, 'HH24:MI') ||
                               COALESCE(' - ' || to_char(a.shift_end_time, 'HH24:MI'), ''));
      END IF;
      IF NULLIF(a.notes, '') IS NOT NULL THEN
        v_lines := v_lines || ('Notes: ' || a.notes);
      END IF;
    END IF;
  END IF;

  v_lines := v_lines || ARRAY['',
    'Open in the app: https://bicycleromahub.lovable.app/rental-points?point=' || COALESCE(_point_id::text, '')];
  RETURN v_lines;
END $$;

REVOKE ALL ON FUNCTION public.rental_day_email_lines(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rental_day_email_lines(uuid, date) FROM anon;
REVOKE ALL ON FUNCTION public.rental_day_email_lines(uuid, date) FROM authenticated;

-- ============ Guide notifications ============
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
  v_lines text[];
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
        '- ' || COALESCE(v_sender, 'Bicycle Roma Hub')
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

  v_lines := ARRAY['Hi ' || v_greet || ',', '', NEW.body, ''];

  IF NEW.shift_id IS NOT NULL THEN
    -- Full booking detail block (tour, date/time, meeting point, guests,
    -- customer, guides, notes) plus a deep link to the tour.
    v_lines := v_lines || public.shift_email_lines(NEW.shift_id);
  ELSE
    v_link := 'https://bicycleromahub.lovable.app' || COALESCE(NEW.link, '/shifts');
    v_lines := v_lines || ('Open in the app: ' || v_link);
  END IF;

  IF NEW.type = 'assigned' OR NEW.type = 'reassigned' THEN
    v_lines := v_lines || ARRAY['', 'Please open the app to accept or decline this tour.'];
  END IF;

  PERFORM public.email_outbox_enqueue(
    v_email, v_name,
    NEW.title,
    NEW.title,
    v_lines,
    'guide_notification:' || NEW.type::text,
    v_dedupe
  );
  RETURN NEW;
END $function$;

-- ============ Rental staff notifications ============
CREATE OR REPLACE FUNCTION public.email_on_rental_staff_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_name text;
  v_greet text;
  v_lines text[];
BEGIN
  SELECT email, name INTO v_email, v_name FROM public.rental_staff WHERE id = NEW.rental_staff_id;
  IF v_email IS NULL THEN RETURN NEW; END IF;

  v_greet := initcap(split_part(replace(replace(
    split_part(COALESCE(NULLIF(btrim(v_name), ''), 'there'), '@', 1), '_', ' '), '.', ' '), ' ', 1));

  v_lines := ARRAY['Hi ' || v_greet || ',', '', NEW.body, ''];

  IF NEW.rental_point_id IS NOT NULL THEN
    v_lines := v_lines || public.rental_day_email_lines(NEW.rental_point_id, NEW.date);
  ELSE
    v_lines := v_lines || ('Open in the app: https://bicycleromahub.lovable.app' ||
                           COALESCE(NEW.link, '/shifts'));
  END IF;

  IF NEW.type = 'assigned' THEN
    v_lines := v_lines || ARRAY['', 'Please open the app to accept or decline this day.'];
  END IF;

  PERFORM public.email_outbox_enqueue(
    v_email, v_name, NEW.title, NEW.title, v_lines,
    'rental_notification:' || NEW.type::text,
    'rnotif:' || NEW.id::text
  );
  RETURN NEW;
END $function$;

-- ============ Additional guide added / removed ============
CREATE OR REPLACE FUNCTION public.email_on_additional_guide()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_shift public.shifts%ROWTYPE;
  v_email text; v_name text;
  v_staff uuid;
BEGIN
  v_staff := CASE WHEN TG_OP = 'DELETE' THEN OLD.staff_id ELSE NEW.staff_id END;
  SELECT * INTO v_shift FROM public.shifts
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.shift_id ELSE NEW.shift_id END;
  IF NOT FOUND THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT email, name INTO v_email, v_name FROM public.staff WHERE id = v_staff;
  IF v_email IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.email_outbox_enqueue(
      v_email, v_name,
      'Added as additional guide - ' || COALESCE(v_shift.tour_name, 'Tour') || ' - ' || to_char(v_shift.date, 'DD Mon'),
      'You were added as an additional guide',
      ARRAY['Hi ' || COALESCE(v_name, 'there') || ',', ''] ||
        public.shift_email_lines(v_shift.id) ||
        ARRAY['', 'Please open the app to accept or decline this tour.'],
      'additional_guide_assigned',
      'sag:' || NEW.id::text || ':assigned'
    );
  ELSE
    PERFORM public.email_outbox_enqueue(
      v_email, v_name,
      'Removed from tour - ' || COALESCE(v_shift.tour_name, 'Tour') || ' - ' || to_char(v_shift.date, 'DD Mon'),
      'You were removed from a tour',
      ARRAY['Hi ' || COALESCE(v_name, 'there') || ',', ''] ||
        public.shift_email_lines(v_shift.id) ||
        ARRAY['', 'No action is needed - your calendar has been updated.'],
      'additional_guide_removed',
      'sag:' || OLD.id::text || ':removed'
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;

-- ============ Shift detail changes ============
CREATE OR REPLACE FUNCTION public.email_on_shift_details_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_sig text;
  v_when text;
  v_lines text[];
BEGIN
  IF NEW.cancelled_at IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.date IS NOT DISTINCT FROM OLD.date
     AND NEW.start_time IS NOT DISTINCT FROM OLD.start_time
     AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time
     AND NEW.meeting_point IS NOT DISTINCT FROM OLD.meeting_point
     AND NEW.tour_name IS NOT DISTINCT FROM OLD.tour_name THEN
    RETURN NEW;
  END IF;

  v_sig := md5(COALESCE(NEW.tour_name, '') || COALESCE(NEW.date::text, '') ||
               COALESCE(NEW.start_time::text, '') || COALESCE(NEW.end_time::text, '') ||
               COALESCE(NEW.meeting_point, ''));

  v_when := to_char(NEW.date, 'Dy DD Mon YYYY') ||
            COALESCE(' at ' || to_char(NEW.start_time, 'HH24:MI'), '') ||
            COALESCE('-' || to_char(NEW.end_time, 'HH24:MI'), '');

  v_lines := ARRAY['A tour on your schedule was updated.', ''] ||
             public.shift_email_lines(NEW.id);

  IF NEW.date IS DISTINCT FROM OLD.date OR NEW.start_time IS DISTINCT FROM OLD.start_time THEN
    v_lines := v_lines || ARRAY['', 'Previously: ' || to_char(OLD.date, 'Dy DD Mon') ||
      COALESCE(' at ' || to_char(OLD.start_time, 'HH24:MI'), '')];
  END IF;
  IF NEW.meeting_point IS DISTINCT FROM OLD.meeting_point THEN
    v_lines := v_lines || ('Previous meeting point: ' || COALESCE(OLD.meeting_point, '-'));
  END IF;
  IF NEW.tour_name IS DISTINCT FROM OLD.tour_name THEN
    v_lines := v_lines || ('Previous tour: ' || COALESCE(OLD.tour_name, '-'));
  END IF;

  FOR r IN
    SELECT s.id, s.name, s.email FROM public.staff s WHERE s.id = NEW.assigned_staff_id
    UNION
    SELECT s.id, s.name, s.email
      FROM public.shift_additional_guides ag
      JOIN public.staff s ON s.id = ag.staff_id
     WHERE ag.shift_id = NEW.id AND ag.status <> 'rejected'
  LOOP
    PERFORM public.email_outbox_enqueue(
      r.email, r.name,
      'Tour updated - ' || COALESCE(NEW.tour_name, 'Tour') || ' - ' || to_char(NEW.date, 'DD Mon'),
      'Your tour details changed',
      ARRAY['Hi ' || COALESCE(r.name, 'there') || ',', ''] || v_lines,
      'shift_updated',
      'shiftupd:' || NEW.id::text || ':' || r.id::text || ':' || v_sig
    );

    INSERT INTO public.guide_notifications (staff_id, type, title, body, shift_id, link, read)
    VALUES (r.id, 'shift_updated', 'Tour details updated',
            COALESCE(NEW.tour_name, 'Tour') || ' - ' || v_when,
            NEW.id, '/shifts?tab=mine&shift=' || NEW.id::text, false)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END $function$;

-- ============ Admin notifications ============
CREATE OR REPLACE FUNCTION public.email_admins_on_shift_response()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status::text NOT IN ('accepted', 'rejected') THEN RETURN NEW; END IF;

  SELECT name INTO v_name FROM public.staff WHERE id = NEW.assigned_staff_id;

  PERFORM public.email_outbox_enqueue_admins(
    CASE WHEN NEW.status::text = 'accepted' THEN 'Guide accepted - ' ELSE 'Guide declined - ' END
      || COALESCE(NEW.tour_name, 'Tour') || ' - ' || to_char(NEW.date, 'DD Mon'),
    CASE WHEN NEW.status::text = 'accepted'
         THEN COALESCE(v_name, 'A guide') || ' accepted a tour'
         ELSE COALESCE(v_name, 'A guide') || ' declined a tour' END,
    ARRAY['Guide: ' || COALESCE(v_name, '-')] ||
      CASE WHEN NULLIF(NEW.rejection_reason, '') IS NOT NULL
           THEN ARRAY['Reason: ' || NEW.rejection_reason] ELSE '{}'::text[] END ||
      ARRAY[''] ||
      public.shift_email_lines(NEW.id) ||
      ARRAY['', CASE WHEN NEW.status::text = 'rejected'
                     THEN 'Please reassign this tour in the app.'
                     ELSE 'No action needed.' END],
    'shift_response:' || NEW.status::text,
    'sresp:' || NEW.id::text || ':' || COALESCE(NEW.assigned_staff_id::text, 'none') || ':' || NEW.status::text
  );
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.email_admins_on_additional_guide_response()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_shift public.shifts%ROWTYPE;
  v_name text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('accepted', 'rejected') THEN RETURN NEW; END IF;

  SELECT * INTO v_shift FROM public.shifts WHERE id = NEW.shift_id;
  SELECT name INTO v_name FROM public.staff WHERE id = NEW.staff_id;

  PERFORM public.email_outbox_enqueue_admins(
    CASE WHEN NEW.status = 'accepted' THEN 'Additional guide accepted - ' ELSE 'Additional guide declined - ' END
      || COALESCE(v_shift.tour_name, 'Tour') || ' - ' || to_char(v_shift.date, 'DD Mon'),
    COALESCE(v_name, 'An additional guide') ||
      CASE WHEN NEW.status = 'accepted' THEN ' accepted a tour' ELSE ' declined a tour' END,
    ARRAY['Additional guide: ' || COALESCE(v_name, '-')] ||
      CASE WHEN NULLIF(NEW.rejection_reason, '') IS NOT NULL
           THEN ARRAY['Reason: ' || NEW.rejection_reason] ELSE '{}'::text[] END ||
      ARRAY[''] ||
      public.shift_email_lines(NEW.shift_id) ||
      ARRAY['', CASE WHEN NEW.status = 'rejected'
                     THEN 'Please assign another guide in the app.'
                     ELSE 'No action needed.' END],
    'additional_guide_response:' || NEW.status,
    'sagresp:' || NEW.id::text || ':' || NEW.status
  );
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.email_admins_on_rental_day_response()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_point text;
  v_name text;
  v_phone text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('accepted', 'rejected') THEN RETURN NEW; END IF;

  SELECT name INTO v_point FROM public.rental_points WHERE id = NEW.rental_point_id;
  SELECT name, phone INTO v_name, v_phone FROM public.rental_staff WHERE id = NEW.rental_staff_id;

  PERFORM public.email_outbox_enqueue_admins(
    CASE WHEN NEW.status = 'accepted' THEN 'Rental day accepted - ' ELSE 'Rental day declined - ' END
      || COALESCE(v_point, 'Rental point') || ' - ' || to_char(NEW.date, 'DD Mon'),
    COALESCE(v_name, 'A rental staff member') ||
      CASE WHEN NEW.status = 'accepted' THEN ' accepted a rental day' ELSE ' declined a rental day' END,
    ARRAY['Staff: ' || COALESCE(v_name, '-') || COALESCE(' - ' || NULLIF(v_phone, ''), '')] ||
      CASE WHEN NULLIF(NEW.rejection_reason, '') IS NOT NULL
           THEN ARRAY['Reason: ' || NEW.rejection_reason] ELSE '{}'::text[] END ||
      ARRAY[''] ||
      public.rental_day_email_lines(NEW.rental_point_id, NEW.date) ||
      ARRAY['', CASE WHEN NEW.status = 'rejected'
                     THEN 'Please reassign this day in the app.'
                     ELSE 'No action needed.' END],
    'rental_day_response:' || NEW.status,
    'rdresp:' || NEW.id::text || ':' || NEW.status
  );
  RETURN NEW;
END $function$;