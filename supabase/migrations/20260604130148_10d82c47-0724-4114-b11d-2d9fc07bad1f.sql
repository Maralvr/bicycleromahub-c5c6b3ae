GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT ALL ON public.staff TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.field_updates TO authenticated;
GRANT ALL ON public.field_updates TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.guide_notifications TO authenticated;
GRANT ALL ON public.guide_notifications TO service_role;

DROP POLICY IF EXISTS fu_select ON public.field_updates;
CREATE POLICY fu_select
ON public.field_updates
FOR SELECT
TO authenticated
USING (
  type = 'broadcast'::public.field_update_type
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR author_id = auth.uid()
  OR author_id IN (SELECT id FROM public.staff WHERE profile_id = auth.uid())
);