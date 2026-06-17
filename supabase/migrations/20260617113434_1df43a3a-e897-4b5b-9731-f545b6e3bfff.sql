
-- Restrict waiver_signatures direct SELECT to admins
DROP POLICY IF EXISTS ws_select ON public.waiver_signatures;
CREATE POLICY ws_select ON public.waiver_signatures
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Boolean-only access for guides via security-definer function
CREATE OR REPLACE FUNCTION public.my_signed_waiver_shift_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT w.matched_shift_id
    FROM public.waiver_signatures w
    JOIN public.shifts s ON s.id = w.matched_shift_id
    JOIN public.staff st ON st.id = s.assigned_staff_id
   WHERE st.profile_id = auth.uid()
     AND w.matched_shift_id IS NOT NULL
$$;

GRANT EXECUTE ON FUNCTION public.my_signed_waiver_shift_ids() TO authenticated;
