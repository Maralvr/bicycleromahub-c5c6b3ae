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