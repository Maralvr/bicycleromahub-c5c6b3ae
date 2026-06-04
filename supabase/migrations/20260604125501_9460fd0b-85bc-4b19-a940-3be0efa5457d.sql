-- Add expiry tracking + cancel RPC + auto-expire function for pending shift requests
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS pending_expires_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS requested_by uuid;

-- Allow the sensitive-fields trigger to accept admin-set timestamps without admin role on guide updates
-- (already restricted; new cols not in protected list so guides cannot tamper either — leave as-is)

-- Admin cancels a pending request: clears assignment, notifies the guide
CREATE OR REPLACE FUNCTION public.cancel_shift_request(_shift_id uuid, _reason text DEFAULT NULL)
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

  INSERT INTO public.guide_notifications (staff_id, type, title, body, shift_id, link)
  VALUES (
    v_staff_id,
    'unassigned',
    'Shift request cancelled',
    COALESCE(_reason, '') || CASE WHEN _reason IS NULL THEN '' ELSE ' — ' END ||
      v_tour || ' on ' || to_char(v_date, 'Mon DD'),
    _shift_id,
    '/shifts'
  );
END;
$$;

-- Auto-expire pending requests older than their expiry; notify admins
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

    -- Notify all admins
    FOR v_admin_id IN
      SELECT s.id FROM public.staff s
      JOIN public.user_roles ur ON ur.user_id = s.profile_id
      WHERE ur.role = 'admin' AND s.active = true
    LOOP
      INSERT INTO public.guide_notifications (staff_id, type, title, body, shift_id, link)
      VALUES (
        v_admin_id,
        'reassigned',
        'Shift request expired',
        r.tour_name || ' on ' || to_char(r.date, 'Mon DD') || ' — no response in 2h, please reassign',
        r.id,
        '/shifts'
      );
    END LOOP;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_shift_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_shift_requests() TO authenticated, service_role;