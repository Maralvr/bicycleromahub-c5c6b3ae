CREATE OR REPLACE FUNCTION public.reject_shift(_shift_id uuid, _reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_staff_id uuid;
  v_previous uuid;
  v_existing uuid[];
  v_new_rejected uuid[];
BEGIN
  SELECT id INTO v_staff_id FROM public.staff WHERE profile_id = auth.uid() LIMIT 1;
  IF v_staff_id IS NULL AND NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT assigned_staff_id, COALESCE(rejected_by_staff_ids, ARRAY[]::uuid[])
    INTO v_previous, v_existing
    FROM public.shifts WHERE id = _shift_id;

  IF v_previous IS NULL THEN
    RAISE EXCEPTION 'Shift has no assigned guide';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT x
    FROM unnest(v_existing || ARRAY[v_previous]) AS x
    WHERE x IS NOT NULL
  ) INTO v_new_rejected;

  UPDATE public.shifts
    SET assigned_staff_id = NULL,
        status = 'unassigned',
        pending_expires_at = NULL,
        rejection_reason = NULLIF(trim(coalesce(_reason, '')), ''),
        rejected_by_staff_ids = v_new_rejected
    WHERE id = _shift_id
      AND (assigned_staff_id = v_staff_id OR has_role(auth.uid(), 'admin'));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift not found or not assigned to you';
  END IF;

  INSERT INTO public.shift_dispatch_events (shift_id, event_type, previous_staff_id, actor_profile_id, reason)
  VALUES (_shift_id, 'rejected', v_previous, auth.uid(), NULLIF(trim(coalesce(_reason, '')), ''));
END;
$function$;