-- Fix tasks_assignee_update: assigned_to references staff.id, not auth.uid().
DROP POLICY IF EXISTS tasks_assignee_update ON public.tasks;

CREATE POLICY tasks_assignee_update
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  assigned_to IN (SELECT id FROM public.staff WHERE profile_id = auth.uid())
)
WITH CHECK (
  assigned_to IN (SELECT id FROM public.staff WHERE profile_id = auth.uid())
);