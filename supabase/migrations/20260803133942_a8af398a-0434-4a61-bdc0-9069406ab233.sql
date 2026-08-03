-- Returns the id of a shift that conflicts with the given guide/date/time window, or NULL.
-- "Same departure" rows (same date + same times + same product or tour name) never conflict:
-- one Bokun departure produces one shifts row per booking and a guide legitimately leads all of them.
CREATE OR REPLACE FUNCTION public.guide_conflicting_shift(
  _staff_id uuid,
  _date date,
  _start time without time zone,
  _end time without time zone,
  _exclude_shift_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH me AS (
    SELECT s.tour_name, s.bokun_product_id
      FROM public.shifts s
     WHERE s.id = _exclude_shift_id
  ), committed AS (
    SELECT s.id, s.tour_name, s.bokun_product_id, s.date, s.start_time, s.end_time
      FROM public.shifts s
     WHERE s.assigned_staff_id = _staff_id
       AND s.status IN ('pending', 'accepted')
    UNION
    SELECT s.id, s.tour_name, s.bokun_product_id, s.date, s.start_time, s.end_time
      FROM public.shift_additional_guides ag
      JOIN public.shifts s ON s.id = ag.shift_id
     WHERE ag.staff_id = _staff_id
       AND ag.status IN ('pending', 'accepted')
  )
  SELECT c.id
    FROM committed c
    LEFT JOIN me ON true
   WHERE c.id IS DISTINCT FROM _exclude_shift_id
     AND c.date = _date
     AND c.start_time < _end
     AND _start < c.end_time
     -- same-departure exemption
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
$$;

GRANT EXECUTE ON FUNCTION public.guide_conflicting_shift(uuid, date, time without time zone, time without time zone, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guide_conflicting_shift(uuid, date, time without time zone, time without time zone, uuid) TO service_role;

-- Convenience wrapper for the UI: which of these guides are busy for this window?
CREATE OR REPLACE FUNCTION public.busy_staff_ids(
  _date date,
  _start time without time zone,
  _end time without time zone,
  _exclude_shift_id uuid DEFAULT NULL
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT st.id
    FROM public.staff st
   WHERE public.guide_conflicting_shift(st.id, _date, _start, _end, _exclude_shift_id) IS NOT NULL
$$;

GRANT EXECUTE ON FUNCTION public.busy_staff_ids(date, time without time zone, time without time zone, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.busy_staff_ids(date, time without time zone, time without time zone, uuid) TO service_role;

-- Shared error raiser
CREATE OR REPLACE FUNCTION public.raise_guide_conflict(_conflict_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name text;
  v_date date;
  v_start time without time zone;
  v_end time without time zone;
BEGIN
  SELECT tour_name, date, start_time, end_time
    INTO v_name, v_date, v_start, v_end
    FROM public.shifts WHERE id = _conflict_id;
  RAISE EXCEPTION 'This guide is already booked on % from % to % (%)',
    to_char(v_date, 'Mon DD'), to_char(v_start, 'HH24:MI'), to_char(v_end, 'HH24:MI'), COALESCE(v_name, 'another tour')
    USING ERRCODE = '23P01';
END;
$$;

-- Trigger on shifts: only when the assigned guide is newly set or changed
CREATE OR REPLACE FUNCTION public.shifts_block_guide_conflict()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_conflict uuid;
BEGIN
  IF auth.role() = 'service_role' OR current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.assigned_staff_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.assigned_staff_id IS NOT DISTINCT FROM OLD.assigned_staff_id
     AND NEW.date IS NOT DISTINCT FROM OLD.date
     AND NEW.start_time IS NOT DISTINCT FROM OLD.start_time
     AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time
     AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('pending', 'accepted') THEN
    RETURN NEW;
  END IF;

  -- Serialise concurrent admins acting on the same guide/day
  PERFORM pg_advisory_xact_lock(hashtext(NEW.assigned_staff_id::text || NEW.date::text));

  v_conflict := public.guide_conflicting_shift(
    NEW.assigned_staff_id, NEW.date, NEW.start_time, NEW.end_time, NEW.id
  );
  IF v_conflict IS NOT NULL THEN
    PERFORM public.raise_guide_conflict(v_conflict);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shifts_block_guide_conflict_trg ON public.shifts;
CREATE TRIGGER shifts_block_guide_conflict_trg
  BEFORE INSERT OR UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.shifts_block_guide_conflict();

-- Trigger on shift_additional_guides
CREATE OR REPLACE FUNCTION public.sag_block_guide_conflict()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_conflict uuid;
  v_date date;
  v_start time without time zone;
  v_end time without time zone;
BEGIN
  IF auth.role() = 'service_role' OR current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('pending', 'accepted') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.staff_id IS NOT DISTINCT FROM OLD.staff_id
     AND NEW.shift_id IS NOT DISTINCT FROM OLD.shift_id
     AND OLD.status IN ('pending', 'accepted') THEN
    RETURN NEW;
  END IF;

  SELECT date, start_time, end_time INTO v_date, v_start, v_end
    FROM public.shifts WHERE id = NEW.shift_id;
  IF v_date IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.staff_id::text || v_date::text));

  v_conflict := public.guide_conflicting_shift(NEW.staff_id, v_date, v_start, v_end, NEW.shift_id);
  IF v_conflict IS NOT NULL THEN
    PERFORM public.raise_guide_conflict(v_conflict);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sag_block_guide_conflict_trg ON public.shift_additional_guides;
CREATE TRIGGER sag_block_guide_conflict_trg
  BEFORE INSERT OR UPDATE ON public.shift_additional_guides
  FOR EACH ROW EXECUTE FUNCTION public.sag_block_guide_conflict();