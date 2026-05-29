
CREATE TABLE public.booking_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL,
  author_profile_id uuid NOT NULL,
  author_name text NOT NULL DEFAULT '',
  author_role text NOT NULL DEFAULT 'guide',
  message text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_notes_shift ON public.booking_notes(shift_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_notes TO authenticated;
GRANT ALL ON public.booking_notes TO service_role;

ALTER TABLE public.booking_notes ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY bn_admin_all ON public.booking_notes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Read: admin or the staff currently assigned to the shift
CREATE POLICY bn_assigned_select ON public.booking_notes
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    OR shift_id IN (
      SELECT s.id FROM public.shifts s
      JOIN public.staff st ON st.id = s.assigned_staff_id
      WHERE st.profile_id = auth.uid()
    )
  );

-- Insert: must be self (author_profile_id = auth.uid()) AND admin or assigned guide
CREATE POLICY bn_assigned_insert ON public.booking_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    author_profile_id = auth.uid()
    AND (
      has_role(auth.uid(), 'admin')
      OR shift_id IN (
        SELECT s.id FROM public.shifts s
        JOIN public.staff st ON st.id = s.assigned_staff_id
        WHERE st.profile_id = auth.uid()
      )
    )
  );

-- Authors can delete their own notes
CREATE POLICY bn_author_delete ON public.booking_notes
  FOR DELETE TO authenticated
  USING (author_profile_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_notes;
