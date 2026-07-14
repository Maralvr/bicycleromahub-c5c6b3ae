CREATE TABLE IF NOT EXISTS public.shift_additional_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  rejection_reason text,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (shift_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_shift_additional_guides_shift ON public.shift_additional_guides(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_additional_guides_staff ON public.shift_additional_guides(staff_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_additional_guides TO authenticated;
GRANT ALL ON public.shift_additional_guides TO service_role;

ALTER TABLE public.shift_additional_guides ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_additional_guide_for_shift(_shift_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shift_additional_guides sag
    JOIN public.staff st ON st.id = sag.staff_id
    WHERE sag.shift_id = _shift_id AND st.profile_id = _profile_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_primary_guide_for_shift(_shift_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shifts s
    JOIN public.staff st ON st.id = s.assigned_staff_id
    WHERE s.id = _shift_id AND st.profile_id = _profile_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_additional_guide_for_shift(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_additional_guide_for_shift(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.is_primary_guide_for_shift(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_primary_guide_for_shift(uuid, uuid) TO authenticated;

CREATE POLICY "shift_additional_guides_admin_all" ON public.shift_additional_guides
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "shift_additional_guides_staff_select" ON public.shift_additional_guides
  FOR SELECT TO authenticated
  USING (
    staff_id IN (SELECT id FROM public.staff WHERE profile_id = auth.uid())
    OR public.is_primary_guide_for_shift(shift_id, auth.uid())
  );

DROP POLICY IF EXISTS "shifts_select" ON public.shifts;
CREATE POLICY "shifts_select" ON public.shifts FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR assigned_staff_id IN (SELECT id FROM public.staff WHERE profile_id = auth.uid())
  OR public.is_additional_guide_for_shift(id, auth.uid())
);

CREATE OR REPLACE FUNCTION public.accept_additional_guide_assignment(_shift_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
BEGIN
  SELECT id INTO v_staff_id FROM public.staff WHERE profile_id = auth.uid() LIMIT 1;
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.shift_additional_guides
    SET status = 'accepted', responded_at = now(), rejection_reason = NULL
    WHERE shift_id = _shift_id AND staff_id = v_staff_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found or not yours';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_additional_guide_assignment(_shift_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
BEGIN
  SELECT id INTO v_staff_id FROM public.staff WHERE profile_id = auth.uid() LIMIT 1;
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.shift_additional_guides
    SET status = 'rejected', responded_at = now(),
        rejection_reason = NULLIF(trim(coalesce(_reason, '')), '')
    WHERE shift_id = _shift_id AND staff_id = v_staff_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found or not yours';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_additional_guide_assignment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_additional_guide_assignment(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.reject_additional_guide_assignment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_additional_guide_assignment(uuid, text) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_additional_guides;
ALTER TABLE public.shift_additional_guides REPLICA IDENTITY FULL;