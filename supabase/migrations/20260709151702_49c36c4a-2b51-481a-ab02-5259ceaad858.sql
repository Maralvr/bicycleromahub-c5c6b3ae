ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS no_show boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS no_show_reported_at timestamptz,
  ADD COLUMN IF NOT EXISTS no_show_reported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS no_show_notes text;

CREATE OR REPLACE FUNCTION public.set_shift_no_show(
  _shift_id uuid,
  _no_show boolean,
  _notes text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rental_point_id uuid;
  v_assigned_staff_id uuid;
  v_tour_name text;
  v_date date;
  v_is_admin boolean;
  v_authorized boolean := false;
  v_admin_staff uuid;
BEGIN
  SELECT rental_point_id, assigned_staff_id, tour_name, date
    INTO v_rental_point_id, v_assigned_staff_id, v_tour_name, v_date
    FROM public.shifts WHERE id = _shift_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift not found';
  END IF;

  v_is_admin := has_role(auth.uid(), 'admin'::app_role);

  IF v_is_admin THEN
    v_authorized := true;
  ELSE
    IF v_assigned_staff_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.staff WHERE id = v_assigned_staff_id AND profile_id = auth.uid()
    ) THEN
      v_authorized := true;
    END IF;

    IF NOT v_authorized AND v_rental_point_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.rental_staff WHERE profile_id = auth.uid()) THEN
      v_authorized := true;
    END IF;
  END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.shifts
     SET no_show = _no_show,
         no_show_reported_at = CASE WHEN _no_show THEN now() ELSE NULL END,
         no_show_reported_by = CASE WHEN _no_show THEN auth.uid() ELSE NULL END,
         no_show_notes = CASE WHEN _no_show THEN NULLIF(trim(coalesce(_notes, '')), '') ELSE NULL END
   WHERE id = _shift_id;

  IF _no_show THEN
    FOR v_admin_staff IN
      SELECT s.id FROM public.staff s
      JOIN public.user_roles ur ON ur.user_id = s.profile_id
      WHERE ur.role = 'admin' AND s.active = true
    LOOP
      INSERT INTO public.guide_notifications (staff_id, type, title, body, link)
      VALUES (
        v_admin_staff,
        'no_show'::notification_type,
        'No-show reported',
        COALESCE(v_tour_name, 'A booking') || ' on ' || to_char(v_date, 'Mon DD') ||
          CASE WHEN _notes IS NULL OR trim(_notes) = '' THEN '' ELSE ' — ' || _notes END,
        '/shifts?shift=' || _shift_id::text
      );
    END LOOP;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.set_shift_no_show(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_shift_no_show(uuid, boolean, text) TO authenticated;