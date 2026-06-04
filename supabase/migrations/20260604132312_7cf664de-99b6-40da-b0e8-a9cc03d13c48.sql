
-- Archive support on notifications
ALTER TABLE public.guide_notifications
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS field_update_id uuid;

CREATE INDEX IF NOT EXISTS gnotif_field_update_idx ON public.guide_notifications(field_update_id);
CREATE INDEX IF NOT EXISTS gnotif_archived_idx ON public.guide_notifications(staff_id, archived_at);

-- Allow author of a field_update to delete their own post
DROP POLICY IF EXISTS fu_self_delete ON public.field_updates;
CREATE POLICY fu_self_delete
  ON public.field_updates
  FOR DELETE
  TO authenticated
  USING (
    author_id = auth.uid()
    OR author_id IN (SELECT id FROM public.staff WHERE profile_id = auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Ensure recipient can update their own notification (archive/read)
-- Existing gnotif_self_update policy already allows this; nothing further to change.
