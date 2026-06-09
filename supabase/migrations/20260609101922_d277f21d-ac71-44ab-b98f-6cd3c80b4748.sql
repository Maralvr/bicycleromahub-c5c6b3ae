
-- 1. Add columns to shifts
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS rejected_by_staff_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- 2. Dispatch events table (audit trail)
CREATE TABLE IF NOT EXISTS public.shift_dispatch_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('dispatched','accepted','rejected','expired','cancelled','unassigned','reassigned')),
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  previous_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  actor_profile_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shift_dispatch_events_shift ON public.shift_dispatch_events(shift_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shift_dispatch_events_created ON public.shift_dispatch_events(created_at DESC);

GRANT SELECT ON public.shift_dispatch_events TO authenticated;
GRANT ALL ON public.shift_dispatch_events TO service_role;

ALTER TABLE public.shift_dispatch_events ENABLE ROW LEVEL SECURITY;

-- Admins see all events; staff see events for shifts assigned to them (current or previous).
CREATE POLICY "Admins read all dispatch events"
  ON public.shift_dispatch_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff read their own dispatch events"
  ON public.shift_dispatch_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.profile_id = auth.uid()
        AND (s.id = staff_id OR s.id = previous_staff_id)
    )
  );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_dispatch_events;
ALTER TABLE public.shift_dispatch_events REPLICA IDENTITY FULL;

-- 3. accept_shift RPC (logs event)
CREATE OR REPLACE FUNCTION public.accept_shift(_shift_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_assigned uuid;
BEGIN
  SELECT id INTO v_staff_id FROM public.staff WHERE profile_id = auth.uid() LIMIT 1;
  SELECT assigned_staff_id INTO v_assigned FROM public.shifts WHERE id = _shift_id;

  IF v_assigned IS NULL THEN
    RAISE EXCEPTION 'Shift has no assigned guide';
  END IF;

  IF v_staff_id IS DISTINCT FROM v_assigned AND NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.shifts
    SET status = 'accepted',
        pending_expires_at = NULL,
        rejection_reason = NULL
    WHERE id = _shift_id;

  INSERT INTO public.shift_dispatch_events (shift_id, event_type, staff_id, actor_profile_id)
  VALUES (_shift_id, 'accepted', v_assigned, auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_shift(uuid) TO authenticated;

-- 4. Replace reject_shift to accept reason, append cooldown list, log event
DROP FUNCTION IF EXISTS public.reject_shift(uuid);

CREATE OR REPLACE FUNCTION public.reject_shift(_shift_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_previous uuid;
BEGIN
  SELECT id INTO v_staff_id FROM public.staff WHERE profile_id = auth.uid() LIMIT 1;
  IF v_staff_id IS NULL AND NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT assigned_staff_id INTO v_previous FROM public.shifts WHERE id = _shift_id;

  UPDATE public.shifts
    SET assigned_staff_id = NULL,
        status = 'unassigned',
        pending_expires_at = NULL,
        rejection_reason = NULLIF(trim(coalesce(_reason, '')), ''),
        rejected_by_staff_ids = (
          SELECT array(SELECT DISTINCT unnest(rejected_by_staff_ids || ARRAY[v_previous]) WHERE unnest IS NOT NULL)
        )
    WHERE id = _shift_id
      AND (assigned_staff_id = v_staff_id OR has_role(auth.uid(), 'admin'));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift not found or not assigned to you';
  END IF;

  INSERT INTO public.shift_dispatch_events (shift_id, event_type, previous_staff_id, actor_profile_id, reason)
  VALUES (_shift_id, 'rejected', v_previous, auth.uid(), NULLIF(trim(coalesce(_reason, '')), ''));
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_shift(uuid, text) TO authenticated;

-- 5. Update expire_shift_requests to log 'expired'
CREATE OR REPLACE FUNCTION public.expire_shift_requests()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_count integer := 0;
  v_admin_id uuid;
BEGIN
  FOR r IN
    SELECT id, assigned_staff_id, tour_name, date
      FROM public.shifts
     WHERE status = 'pending'
       AND pending_expires_at IS NOT NULL
       AND pending_expires_at < now()
  LOOP
    UPDATE public.shifts
       SET assigned_staff_id = NULL,
           status = 'unassigned',
           pending_expires_at = NULL,
           requested_by = NULL
     WHERE id = r.id;

    INSERT INTO public.shift_dispatch_events (shift_id, event_type, previous_staff_id, reason)
    VALUES (r.id, 'expired', r.assigned_staff_id, 'No response within 2h');

    FOR v_admin_id IN
      SELECT s.id FROM public.staff s
      JOIN public.user_roles ur ON ur.user_id = s.profile_id
      WHERE ur.role = 'admin' AND s.active = true
    LOOP
      INSERT INTO public.guide_notifications (staff_id, type, title, body, shift_id, link)
      VALUES (
        v_admin_id, 'reassigned', 'Shift request expired',
        r.tour_name || ' on ' || to_char(r.date, 'Mon DD') || ' — no response in 2h, please reassign',
        r.id, '/shifts'
      );
    END LOOP;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- 6. Update cancel_shift_request to log 'cancelled'
CREATE OR REPLACE FUNCTION public.cancel_shift_request(_shift_id uuid, _reason text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_tour text;
  v_date date;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can cancel requests';
  END IF;

  SELECT assigned_staff_id, tour_name, date
    INTO v_staff_id, v_tour, v_date
    FROM public.shifts
   WHERE id = _shift_id AND status = 'pending';

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Shift not found or not in pending state';
  END IF;

  UPDATE public.shifts
     SET assigned_staff_id = NULL,
         status = 'unassigned',
         pending_expires_at = NULL,
         requested_by = NULL
   WHERE id = _shift_id;

  INSERT INTO public.shift_dispatch_events (shift_id, event_type, previous_staff_id, actor_profile_id, reason)
  VALUES (_shift_id, 'cancelled', v_staff_id, auth.uid(), _reason);

  INSERT INTO public.guide_notifications (staff_id, type, title, body, shift_id, link)
  VALUES (
    v_staff_id, 'unassigned', 'Shift request cancelled',
    COALESCE(_reason, '') || CASE WHEN _reason IS NULL THEN '' ELSE ' — ' END ||
      v_tour || ' on ' || to_char(v_date, 'Mon DD'),
    _shift_id, '/shifts'
  );
END;
$$;

-- 7. Trigger to log 'dispatched' / 'reassigned' / 'unassigned' on assignment changes
CREATE OR REPLACE FUNCTION public.log_shift_dispatch_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only react to assignment changes
  IF NEW.assigned_staff_id IS NOT DISTINCT FROM OLD.assigned_staff_id THEN
    RETURN NEW;
  END IF;

  -- Skip if RPC already logged it (rejection/cancellation/expiry sets assigned -> NULL)
  -- Detect rejection: rejection_reason set or already logged by reject_shift; we de-dupe by checking last event in the same transaction
  IF OLD.assigned_staff_id IS NOT NULL AND NEW.assigned_staff_id IS NULL THEN
    -- Check if a 'rejected', 'expired', or 'cancelled' event was just inserted (same txn)
    IF EXISTS (
      SELECT 1 FROM public.shift_dispatch_events
      WHERE shift_id = NEW.id
        AND event_type IN ('rejected','expired','cancelled')
        AND created_at > now() - interval '5 seconds'
    ) THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.shift_dispatch_events (shift_id, event_type, previous_staff_id, actor_profile_id)
    VALUES (NEW.id, 'unassigned', OLD.assigned_staff_id, auth.uid());
    RETURN NEW;
  END IF;

  IF OLD.assigned_staff_id IS NULL AND NEW.assigned_staff_id IS NOT NULL THEN
    INSERT INTO public.shift_dispatch_events (shift_id, event_type, staff_id, actor_profile_id)
    VALUES (NEW.id, 'dispatched', NEW.assigned_staff_id, auth.uid());
    RETURN NEW;
  END IF;

  -- Reassigned (X -> Y)
  INSERT INTO public.shift_dispatch_events (shift_id, event_type, staff_id, previous_staff_id, actor_profile_id)
  VALUES (NEW.id, 'reassigned', NEW.assigned_staff_id, OLD.assigned_staff_id, auth.uid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_shift_dispatch_event ON public.shifts;
CREATE TRIGGER trg_log_shift_dispatch_event
  AFTER UPDATE OF assigned_staff_id ON public.shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.log_shift_dispatch_event();

-- 8. Also log INSERTs that already have an assignment (e.g., manual shift created with guide)
CREATE OR REPLACE FUNCTION public.log_shift_dispatch_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_staff_id IS NOT NULL THEN
    INSERT INTO public.shift_dispatch_events (shift_id, event_type, staff_id, actor_profile_id)
    VALUES (NEW.id, 'dispatched', NEW.assigned_staff_id, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_shift_dispatch_on_insert ON public.shifts;
CREATE TRIGGER trg_log_shift_dispatch_on_insert
  AFTER INSERT ON public.shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.log_shift_dispatch_on_insert();
