CREATE OR REPLACE FUNCTION public.can_read_attachment(_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.field_updates f, jsonb_array_elements(f.attachments) a
      WHERE a->>'path' = _path
    )
    OR EXISTS (
      SELECT 1 FROM public.guide_notifications n
      JOIN public.staff s ON s.id = n.staff_id, jsonb_array_elements(n.attachments) a
      WHERE s.profile_id = auth.uid() AND a->>'path' = _path
    )
    OR EXISTS (
      SELECT 1 FROM public.guide_notes g
      JOIN public.staff s ON s.id = g.author_staff_id, jsonb_array_elements(g.attachments) a
      WHERE s.profile_id = auth.uid() AND a->>'path' = _path
    )
    OR EXISTS (
      SELECT 1 FROM public.guide_notes g
      JOIN public.shifts sh ON sh.id = g.shift_id
      JOIN public.staff s ON s.id = sh.assigned_staff_id, jsonb_array_elements(g.attachments) a
      WHERE s.profile_id = auth.uid() AND a->>'path' = _path
    )
    OR EXISTS (
      SELECT 1 FROM public.booking_notes b, jsonb_array_elements(b.attachments) a
      WHERE a->>'path' = _path
        AND (
          b.author_profile_id = auth.uid()
          OR public.is_primary_guide_for_shift(b.shift_id, auth.uid())
          OR public.is_additional_guide_for_shift(b.shift_id, auth.uid())
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.task_updates t
      JOIN public.tasks tk ON tk.id = t.task_id
      JOIN public.staff s ON s.id = tk.assigned_to, jsonb_array_elements(t.attachments) a
      WHERE s.profile_id = auth.uid() AND a->>'path' = _path
    )
    OR EXISTS (
      SELECT 1 FROM public.rental_staff_task_updates t
      JOIN public.rental_staff_tasks tk ON tk.id = t.task_id
      JOIN public.rental_staff rs ON rs.id = tk.assigned_to, jsonb_array_elements(t.attachments) a
      WHERE rs.profile_id = auth.uid() AND a->>'path' = _path
    )
$$;

REVOKE ALL ON FUNCTION public.can_read_attachment(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_attachment(text) TO authenticated, service_role;

DROP POLICY IF EXISTS notif_attachments_read_authenticated ON storage.objects;

CREATE POLICY notif_attachments_read_scoped
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'notification-attachments'
  AND (owner = auth.uid() OR public.can_read_attachment(name))
);