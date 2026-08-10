-- ============ email outbox ============
CREATE TABLE IF NOT EXISTS public.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  recipient_name text,
  subject text NOT NULL,
  heading text NOT NULL,
  lines text[] NOT NULL DEFAULT '{}',
  category text NOT NULL,
  dedupe_key text UNIQUE,
  attempts integer NOT NULL DEFAULT 0,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.email_outbox TO authenticated;
GRANT ALL ON public.email_outbox TO service_role;

ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_outbox_admin_read ON public.email_outbox;
CREATE POLICY email_outbox_admin_read ON public.email_outbox
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS email_outbox_pending_idx
  ON public.email_outbox (created_at) WHERE sent_at IS NULL;

-- ============ enqueue helpers ============
CREATE OR REPLACE FUNCTION public.email_outbox_enqueue(
  _email text, _name text, _subject text, _heading text,
  _lines text[], _category text, _dedupe text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _email IS NULL OR position('@' in _email) = 0 THEN
    RETURN;
  END IF;
  INSERT INTO public.email_outbox (recipient_email, recipient_name, subject, heading, lines, category, dedupe_key)
  VALUES (_email, _name, _subject, _heading, COALESCE(_lines, '{}'), _category, _dedupe)
  ON CONFLICT (dedupe_key) DO NOTHING;
END $$;

REVOKE ALL ON FUNCTION public.email_outbox_enqueue(text, text, text, text, text[], text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.email_outbox_enqueue_admins(
  _subject text, _heading text, _lines text[], _category text, _dedupe text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT s.email, s.name
      FROM public.staff s
      JOIN public.user_roles ur ON ur.user_id = s.profile_id
     WHERE ur.role = 'admin' AND s.active = true
       AND s.email IS NOT NULL AND position('@' in s.email) > 0
  LOOP
    PERFORM public.email_outbox_enqueue(
      r.email, r.name, _subject, _heading, _lines, _category,
      _dedupe || ':' || r.email
    );
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.email_outbox_enqueue_admins(text, text, text[], text, text) FROM PUBLIC, anon, authenticated;

-- ============ guide notifications -> email ============
CREATE OR REPLACE FUNCTION public.email_on_guide_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text;
  v_name text;
  v_dedupe text;
  v_kind text;
  v_assigned uuid;
  v_link text;
BEGIN
  SELECT email, name INTO v_email, v_name FROM public.staff WHERE id = NEW.staff_id;
  IF v_email IS NULL THEN RETURN NEW; END IF;

  -- Reuse the app-side dedupe key for primary-guide assignment mails so the
  -- direct send and this queued one never both go out.
  v_dedupe := 'notif:' || NEW.id::text;
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

  v_link := COALESCE(NEW.link, '/shifts');

  PERFORM public.email_outbox_enqueue(
    v_email, v_name,
    NEW.title,
    NEW.title,
    ARRAY[
      'Hi ' || COALESCE(v_name, 'there') || ',',
      '',
      NEW.body,
      '',
      'Open the app to see the details: ' || v_link
    ],
    'guide_notification:' || NEW.type::text,
    v_dedupe
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_email_on_guide_notification ON public.guide_notifications;
CREATE TRIGGER trg_email_on_guide_notification
  AFTER INSERT ON public.guide_notifications
  FOR EACH ROW EXECUTE FUNCTION public.email_on_guide_notification();

-- ============ rental staff notifications -> email ============
CREATE OR REPLACE FUNCTION public.email_on_rental_staff_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text;
  v_name text;
BEGIN
  -- assignment/removal mails are already sent directly by the app
  IF NEW.type IN ('assigned', 'unassigned', 'shift_cancelled') THEN
    RETURN NEW;
  END IF;

  SELECT email, name INTO v_email, v_name FROM public.rental_staff WHERE id = NEW.rental_staff_id;
  IF v_email IS NULL THEN RETURN NEW; END IF;

  PERFORM public.email_outbox_enqueue(
    v_email, v_name, NEW.title, NEW.title,
    ARRAY[
      'Hi ' || COALESCE(v_name, 'there') || ',',
      '',
      NEW.body,
      '',
      'Open the app to see the details: ' || COALESCE(NEW.link, '/shifts')
    ],
    'rental_notification:' || NEW.type::text,
    'rnotif:' || NEW.id::text
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_email_on_rental_staff_notification ON public.rental_staff_notifications;
CREATE TRIGGER trg_email_on_rental_staff_notification
  AFTER INSERT ON public.rental_staff_notifications
  FOR EACH ROW EXECUTE FUNCTION public.email_on_rental_staff_notification();

-- ============ shift detail changes -> assigned guides ============
CREATE OR REPLACE FUNCTION public.email_on_shift_details_changed()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  v_lines := ARRAY[
    'A tour on your schedule was updated.',
    '',
    'Tour: ' || COALESCE(NEW.tour_name, '-'),
    'When: ' || v_when,
    'Meeting point: ' || COALESCE(NEW.meeting_point, '-'),
    ''
  ];
  IF NEW.date IS DISTINCT FROM OLD.date OR NEW.start_time IS DISTINCT FROM OLD.start_time THEN
    v_lines := v_lines || ('Previously: ' || to_char(OLD.date, 'Dy DD Mon') ||
      COALESCE(' at ' || to_char(OLD.start_time, 'HH24:MI'), ''));
  END IF;
  IF NEW.meeting_point IS DISTINCT FROM OLD.meeting_point THEN
    v_lines := v_lines || ('Previous meeting point: ' || COALESCE(OLD.meeting_point, '-'));
  END IF;
  v_lines := v_lines || ARRAY['', 'Open the app to review the tour.'];

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
END $$;

DROP TRIGGER IF EXISTS trg_email_on_shift_details_changed ON public.shifts;
CREATE TRIGGER trg_email_on_shift_details_changed
  AFTER UPDATE OF date, start_time, end_time, meeting_point, tour_name ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.email_on_shift_details_changed();

-- ============ additional guide added / removed -> that guide ============
CREATE OR REPLACE FUNCTION public.email_on_additional_guide()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shift public.shifts%ROWTYPE;
  v_email text; v_name text;
  v_staff uuid;
  v_when text;
BEGIN
  v_staff := CASE WHEN TG_OP = 'DELETE' THEN OLD.staff_id ELSE NEW.staff_id END;
  SELECT * INTO v_shift FROM public.shifts
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.shift_id ELSE NEW.shift_id END;
  IF NOT FOUND THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT email, name INTO v_email, v_name FROM public.staff WHERE id = v_staff;
  IF v_email IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  v_when := to_char(v_shift.date, 'Dy DD Mon YYYY') ||
            COALESCE(' at ' || to_char(v_shift.start_time, 'HH24:MI'), '');

  IF TG_OP = 'INSERT' THEN
    PERFORM public.email_outbox_enqueue(
      v_email, v_name,
      'Added as additional guide - ' || COALESCE(v_shift.tour_name, 'Tour') || ' - ' || to_char(v_shift.date, 'DD Mon'),
      'You were added as an additional guide',
      ARRAY['Hi ' || COALESCE(v_name, 'there') || ',', '',
            'Tour: ' || COALESCE(v_shift.tour_name, '-'),
            'When: ' || v_when,
            'Meeting point: ' || COALESCE(v_shift.meeting_point, '-'),
            '', 'Please open the app to accept or decline this tour.'],
      'additional_guide_assigned',
      'sag:' || NEW.id::text || ':assigned'
    );
  ELSE
    PERFORM public.email_outbox_enqueue(
      v_email, v_name,
      'Removed from tour - ' || COALESCE(v_shift.tour_name, 'Tour') || ' - ' || to_char(v_shift.date, 'DD Mon'),
      'You were removed from a tour',
      ARRAY['Hi ' || COALESCE(v_name, 'there') || ',', '',
            'Tour: ' || COALESCE(v_shift.tour_name, '-'),
            'When: ' || v_when,
            '', 'No action is needed - your calendar has been updated.'],
      'additional_guide_removed',
      'sag:' || OLD.id::text || ':removed'
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_email_on_additional_guide_ins ON public.shift_additional_guides;
CREATE TRIGGER trg_email_on_additional_guide_ins
  AFTER INSERT ON public.shift_additional_guides
  FOR EACH ROW EXECUTE FUNCTION public.email_on_additional_guide();

DROP TRIGGER IF EXISTS trg_email_on_additional_guide_del ON public.shift_additional_guides;
CREATE TRIGGER trg_email_on_additional_guide_del
  AFTER DELETE ON public.shift_additional_guides
  FOR EACH ROW EXECUTE FUNCTION public.email_on_additional_guide();

-- ============ accept / reject responses -> admins ============
CREATE OR REPLACE FUNCTION public.email_admins_on_shift_response()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text;
  v_when text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status::text NOT IN ('accepted', 'rejected') THEN RETURN NEW; END IF;

  SELECT name INTO v_name FROM public.staff WHERE id = NEW.assigned_staff_id;
  v_when := to_char(NEW.date, 'Dy DD Mon') ||
            COALESCE(' at ' || to_char(NEW.start_time, 'HH24:MI'), '');

  PERFORM public.email_outbox_enqueue_admins(
    CASE WHEN NEW.status::text = 'accepted' THEN 'Guide accepted - ' ELSE 'Guide declined - ' END
      || COALESCE(NEW.tour_name, 'Tour') || ' - ' || to_char(NEW.date, 'DD Mon'),
    CASE WHEN NEW.status::text = 'accepted'
         THEN COALESCE(v_name, 'A guide') || ' accepted a tour'
         ELSE COALESCE(v_name, 'A guide') || ' declined a tour' END,
    ARRAY[
      'Guide: ' || COALESCE(v_name, '-'),
      'Tour: ' || COALESCE(NEW.tour_name, '-'),
      'When: ' || v_when,
      COALESCE('Reason: ' || NULLIF(NEW.rejection_reason, ''), ''),
      '',
      CASE WHEN NEW.status::text = 'rejected'
           THEN 'Please reassign this tour in the app.'
           ELSE 'No action needed.' END
    ],
    'shift_response:' || NEW.status::text,
    'sresp:' || NEW.id::text || ':' || COALESCE(NEW.assigned_staff_id::text, 'none') || ':' || NEW.status::text
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_email_admins_on_shift_response ON public.shifts;
CREATE TRIGGER trg_email_admins_on_shift_response
  AFTER UPDATE OF status ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.email_admins_on_shift_response();

CREATE OR REPLACE FUNCTION public.email_admins_on_additional_guide_response()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    ARRAY[
      'Guide: ' || COALESCE(v_name, '-'),
      'Tour: ' || COALESCE(v_shift.tour_name, '-'),
      'When: ' || to_char(v_shift.date, 'Dy DD Mon') ||
        COALESCE(' at ' || to_char(v_shift.start_time, 'HH24:MI'), ''),
      COALESCE('Reason: ' || NULLIF(NEW.rejection_reason, ''), '')
    ],
    'additional_guide_response:' || NEW.status,
    'sagresp:' || NEW.id::text || ':' || NEW.status
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_email_admins_on_sag_response ON public.shift_additional_guides;
CREATE TRIGGER trg_email_admins_on_sag_response
  AFTER UPDATE OF status ON public.shift_additional_guides
  FOR EACH ROW EXECUTE FUNCTION public.email_admins_on_additional_guide_response();

CREATE OR REPLACE FUNCTION public.email_admins_on_rental_day_response()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_point text;
  v_name text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('accepted', 'rejected') THEN RETURN NEW; END IF;

  SELECT name INTO v_point FROM public.rental_points WHERE id = NEW.rental_point_id;
  SELECT name INTO v_name FROM public.rental_staff WHERE id = NEW.rental_staff_id;

  PERFORM public.email_outbox_enqueue_admins(
    CASE WHEN NEW.status = 'accepted' THEN 'Rental day accepted - ' ELSE 'Rental day declined - ' END
      || COALESCE(v_point, 'Rental point') || ' - ' || to_char(NEW.date, 'DD Mon'),
    COALESCE(v_name, 'A rental staff member') ||
      CASE WHEN NEW.status = 'accepted' THEN ' accepted a rental day' ELSE ' declined a rental day' END,
    ARRAY[
      'Staff: ' || COALESCE(v_name, '-'),
      'Rental point: ' || COALESCE(v_point, '-'),
      'Date: ' || to_char(NEW.date, 'Dy DD Mon'),
      COALESCE('Reason: ' || NULLIF(NEW.rejection_reason, ''), ''),
      '',
      CASE WHEN NEW.status = 'rejected'
           THEN 'Please reassign this day in the app.'
           ELSE 'No action needed.' END
    ],
    'rental_day_response:' || NEW.status,
    'rdresp:' || NEW.id::text || ':' || NEW.status
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_email_admins_on_rental_day_response ON public.rental_point_day_assignments;
CREATE TRIGGER trg_email_admins_on_rental_day_response
  AFTER UPDATE OF status ON public.rental_point_day_assignments
  FOR EACH ROW EXECUTE FUNCTION public.email_admins_on_rental_day_response();