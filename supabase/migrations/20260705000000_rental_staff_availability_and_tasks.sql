-- Real backend support for "My availability" and "Tasks" for rental staff,
-- mirroring the guide-facing tables (staff_unavailability, tasks,
-- task_updates) and following the same parallel-table pattern already used
-- for rental_staff_notifications (rather than merging rental_staff into
-- public.staff, which is read by guide-assignment pickers, payroll, and the
-- admin staff directory and would leak rental accounts into all of those).

-- =========================================================================
-- RENTAL STAFF UNAVAILABILITY (mirrors staff_unavailability)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.rental_staff_unavailability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_staff_id uuid NOT NULL REFERENCES public.rental_staff(id) ON DELETE CASCADE,
  date date NOT NULL,
  all_day boolean NOT NULL DEFAULT true,
  from_time time,
  to_time time,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rental_staff_unavailability_staff_date_idx
  ON public.rental_staff_unavailability(rental_staff_id, date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_staff_unavailability TO authenticated;
GRANT ALL ON public.rental_staff_unavailability TO service_role;
ALTER TABLE public.rental_staff_unavailability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rsu_admin_all" ON public.rental_staff_unavailability
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "rsu_self_all" ON public.rental_staff_unavailability
  FOR ALL TO authenticated
  USING (rental_staff_id IN (SELECT id FROM public.rental_staff WHERE profile_id = auth.uid()))
  WITH CHECK (rental_staff_id IN (SELECT id FROM public.rental_staff WHERE profile_id = auth.uid()));

-- =========================================================================
-- RENTAL STAFF TASKS (mirrors tasks / task_updates)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.rental_staff_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  assigned_to uuid NOT NULL REFERENCES public.rental_staff(id) ON DELETE CASCADE,
  due date NOT NULL,
  priority public.task_priority NOT NULL DEFAULT 'medium',
  done boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rental_staff_tasks_assignee_idx ON public.rental_staff_tasks(assigned_to);

CREATE TRIGGER rental_staff_tasks_updated_at
  BEFORE UPDATE ON public.rental_staff_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_staff_tasks TO authenticated;
GRANT ALL ON public.rental_staff_tasks TO service_role;
ALTER TABLE public.rental_staff_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rst_admin_all" ON public.rental_staff_tasks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "rst_self_select" ON public.rental_staff_tasks
  FOR SELECT TO authenticated
  USING (assigned_to IN (SELECT id FROM public.rental_staff WHERE profile_id = auth.uid()));

-- Assignee may update their own task (e.g. mark done) -- mirrors
-- tasks_assignee_update for guides.
CREATE POLICY "rst_self_update" ON public.rental_staff_tasks
  FOR UPDATE TO authenticated
  USING (assigned_to IN (SELECT id FROM public.rental_staff WHERE profile_id = auth.uid()))
  WITH CHECK (assigned_to IN (SELECT id FROM public.rental_staff WHERE profile_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.rental_staff_task_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.rental_staff_tasks(id) ON DELETE CASCADE,
  -- Null when the update was posted by an admin (admins don't have a
  -- rental_staff row of their own -- same reasoning as leaving this
  -- nullable rather than forcing a synthetic rental_staff identity onto
  -- admin accounts).
  author_rental_staff_id uuid REFERENCES public.rental_staff(id) ON DELETE CASCADE,
  message text NOT NULL,
  type public.task_update_type NOT NULL DEFAULT 'progress',
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rental_staff_task_updates_task_idx ON public.rental_staff_task_updates(task_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_staff_task_updates TO authenticated;
GRANT ALL ON public.rental_staff_task_updates TO service_role;
ALTER TABLE public.rental_staff_task_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rstu_admin_all" ON public.rental_staff_task_updates
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "rstu_self_select" ON public.rental_staff_task_updates
  FOR SELECT TO authenticated
  USING (
    task_id IN (
      SELECT t.id FROM public.rental_staff_tasks t
      JOIN public.rental_staff rs ON rs.id = t.assigned_to
      WHERE rs.profile_id = auth.uid()
    )
  );

CREATE POLICY "rstu_self_insert" ON public.rental_staff_task_updates
  FOR INSERT TO authenticated
  WITH CHECK (
    author_rental_staff_id IN (SELECT id FROM public.rental_staff WHERE profile_id = auth.uid())
    AND task_id IN (
      SELECT t.id FROM public.rental_staff_tasks t
      JOIN public.rental_staff rs ON rs.id = t.assigned_to
      WHERE rs.profile_id = auth.uid()
    )
  );

-- Realtime, matching the pattern used for rental_staff_notifications /
-- rental_point_day_assignments elsewhere in this schema.
ALTER TABLE public.rental_staff_unavailability REPLICA IDENTITY FULL;
ALTER TABLE public.rental_staff_tasks REPLICA IDENTITY FULL;
ALTER TABLE public.rental_staff_task_updates REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rental_staff_unavailability;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rental_staff_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rental_staff_task_updates;
