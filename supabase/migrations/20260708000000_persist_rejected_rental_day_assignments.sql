-- Admin-reported gap: "I assigned a rental staff member but have no way to
-- check if it's accepted, pending, or rejected."
--
-- Pending and accepted were already visible on the rental-points calendar
-- (day-cell ring color + chip in rental-staff-panel.tsx). Rejected was not:
-- reject_rental_day() hard-deleted the assignment row the moment a rental
-- staff member rejected it, so the day silently reverted to "No staff",
-- indistinguishable from a day nobody was ever assigned to. The only trace
-- was a one-time admin notification that disappears once read.
--
-- This keeps the row on rejection (status='rejected', reason attached)
-- instead of deleting it, so it stays visible on the calendar in red until
-- an admin reassigns that day or explicitly dismisses it (via the existing
-- unassign/toggle action, which still deletes the row).

ALTER TABLE public.rental_point_day_assignments
  DROP CONSTRAINT IF EXISTS rpda_status_check;
ALTER TABLE public.rental_point_day_assignments
  ADD CONSTRAINT rpda_status_check CHECK (status IN ('pending', 'accepted', 'rejected'));

CREATE OR REPLACE FUNCTION public.reject_rental_day(_assignment_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_rstaff_id uuid;
  v_owner uuid;
  v_point uuid;
  v_date date;
  v_name text;
  v_admin_staff uuid;
BEGIN
  SELECT id INTO v_rstaff_id FROM public.rental_staff WHERE profile_id = auth.uid() LIMIT 1;
  SELECT rental_staff_id, rental_point_id, date INTO v_owner, v_point, v_date
    FROM public.rental_point_day_assignments WHERE id = _assignment_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;
  IF v_rstaff_id IS DISTINCT FROM v_owner AND NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT name INTO v_name FROM public.rental_points WHERE id = v_point;

  -- Keep the row (was: DELETE) so the rejection stays visible to admins on
  -- the calendar instead of the day silently reverting to unassigned.
  UPDATE public.rental_point_day_assignments
     SET status = 'rejected',
         rejection_reason = NULLIF(trim(coalesce(_reason, '')), ''),
         pending_expires_at = NULL,
         accepted_at = NULL
   WHERE id = _assignment_id;

  -- Notify admins via the existing guide_notifications inbox (unchanged).
  FOR v_admin_staff IN
    SELECT s.id FROM public.staff s
    JOIN public.user_roles ur ON ur.user_id = s.profile_id
    WHERE ur.role = 'admin' AND s.active = true
  LOOP
    INSERT INTO public.guide_notifications (staff_id, type, title, body, link)
    VALUES (v_admin_staff, 'reassigned', 'Rental day rejected',
            COALESCE(v_name, 'Rental point') || ' on ' || to_char(v_date, 'Mon DD') ||
            CASE WHEN _reason IS NULL OR _reason = '' THEN ''
                 ELSE ' — ' || _reason END,
            '/rental-points?point=' || v_point::text);
  END LOOP;
END $$;
