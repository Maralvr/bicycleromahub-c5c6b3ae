create or replace function public.cancel_rental_day(_assignment_id uuid, _reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_rstaff_id uuid;
  v_point uuid;
  v_date date;
  v_name text;
BEGIN
  IF NOT public.can_manage_rental_assignments(auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed to cancel rental days';
  END IF;

  SELECT rental_staff_id, rental_point_id, date
    INTO v_rstaff_id, v_point, v_date
    FROM public.rental_point_day_assignments
   WHERE id = _assignment_id;

  IF v_rstaff_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  SELECT name INTO v_name FROM public.rental_points WHERE id = v_point;

  UPDATE public.rental_point_day_assignments
     SET status = 'cancelled',
         cancelled_at = now(),
         cancelled_reason = NULLIF(trim(coalesce(_reason, '')), ''),
         cancelled_by = auth.uid(),
         pending_expires_at = NULL
   WHERE id = _assignment_id;

  INSERT INTO public.rental_staff_notifications
    (rental_staff_id, type, title, body, rental_point_id, date, link)
  VALUES (v_rstaff_id, 'unassigned', 'Rental day cancelled',
          COALESCE(v_name, 'Rental point') || ' on ' || to_char(v_date, 'Mon DD') ||
          CASE WHEN _reason IS NULL OR trim(_reason) = '' THEN '' ELSE ' — ' || _reason END,
          v_point, v_date, '/shifts?tab=mine');
END
$$;

revoke all on function public.cancel_rental_day(uuid, text) from public;
grant execute on function public.cancel_rental_day(uuid, text) to authenticated, service_role;