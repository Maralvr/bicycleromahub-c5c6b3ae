-- Pre-existing bug found while auditing each role's workflow: guides could
-- not see or complete their own assigned tasks (the /tasks page would show
-- 0 tasks for any non-admin account, no matter how many an admin assigned
-- them), and could not post an update on it either.
--
-- Root cause: public.tasks.assigned_to has always been written by the
-- frontend (TasksStoreProvider.createTasks in tasks-store.tsx) as the
-- assignee's profile_id (auth.users.id) -- not their public.staff.id. The
-- original RLS (20260507173906) matched that correctly:
--   tasks_assignee_update ... using (assigned_to = auth.uid())
-- Two later migrations (20260508085553, 20260604081902), while narrowing
-- tasks visibility for a security pass, incorrectly assumed assigned_to
-- stored staff.id and rewrote the checks as
--   assigned_to IN (SELECT id FROM public.staff WHERE profile_id = auth.uid())
-- profile_id and staff.id are different UUIDs, so that condition can never
-- match a real row -- silently breaking guide SELECT/UPDATE access to their
-- own tasks (admins were unaffected, since they bypass via has_role()).
--
-- This restores the original, correct semantics (assigned_to = auth.uid())
-- for tasks_select and tasks_assignee_update, and fixes the equivalent
-- mismatched JOIN in task_updates' tu_select (which assumed the same wrong
-- shape), so a guide can also see admin-authored updates on their own task.
DROP POLICY IF EXISTS tasks_select ON public.tasks;
CREATE POLICY tasks_select ON public.tasks FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR assigned_to = auth.uid()
);

DROP POLICY IF EXISTS tasks_assignee_update ON public.tasks;
CREATE POLICY tasks_assignee_update ON public.tasks FOR UPDATE TO authenticated
USING (assigned_to = auth.uid())
WITH CHECK (assigned_to = auth.uid());

DROP POLICY IF EXISTS tu_select ON public.task_updates;
CREATE POLICY tu_select ON public.task_updates FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR author_staff_id IN (SELECT id FROM public.staff WHERE profile_id = auth.uid())
  OR task_id IN (SELECT id FROM public.tasks WHERE assigned_to = auth.uid())
);
