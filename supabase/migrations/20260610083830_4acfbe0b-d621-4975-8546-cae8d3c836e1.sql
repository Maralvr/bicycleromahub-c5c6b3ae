-- Prevent guides from escalating their own privileges via the staff table.
-- Replace staff_self_update with a WITH CHECK that locks down role and active/status fields.

DROP POLICY IF EXISTS "staff_self_update" ON public.staff;

CREATE POLICY "staff_self_update"
ON public.staff
FOR UPDATE
TO authenticated
USING (profile_id = auth.uid())
WITH CHECK (
  profile_id = auth.uid()
  AND role = (SELECT s.role FROM public.staff s WHERE s.id = staff.id)
  AND active = (SELECT s.active FROM public.staff s WHERE s.id = staff.id)
  AND status IS NOT DISTINCT FROM (SELECT s.status FROM public.staff s WHERE s.id = staff.id)
  AND tags IS NOT DISTINCT FROM (SELECT s.tags FROM public.staff s WHERE s.id = staff.id)
  AND licenses IS NOT DISTINCT FROM (SELECT s.licenses FROM public.staff s WHERE s.id = staff.id)
);
