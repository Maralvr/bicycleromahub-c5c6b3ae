CREATE OR REPLACE FUNCTION public.busy_guides(
  _date date,
  _start time without time zone,
  _end time without time zone,
  _exclude_shift_id uuid DEFAULT NULL
)
RETURNS TABLE (
  staff_id uuid,
  conflict_shift_id uuid,
  tour_name text,
  start_time time without time zone,
  end_time time without time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT st.id, c.id, c.tour_name, c.start_time, c.end_time
    FROM public.staff st
    JOIN public.shifts c
      ON c.id = public.guide_conflicting_shift(st.id, _date, _start, _end, _exclude_shift_id)
$$;

COMMENT ON FUNCTION public.busy_guides(date, time without time zone, time without time zone, uuid) IS
  'UI source of truth for guide overlap: for a given window, returns each guide who already has a live commitment (primary shift OR additional-guide assignment) plus the clashing shift, via guide_conflicting_shift.';

REVOKE ALL ON FUNCTION public.busy_guides(date, time without time zone, time without time zone, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.busy_guides(date, time without time zone, time without time zone, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.busy_guides(date, time without time zone, time without time zone, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.busy_guides(date, time without time zone, time without time zone, uuid) TO service_role;