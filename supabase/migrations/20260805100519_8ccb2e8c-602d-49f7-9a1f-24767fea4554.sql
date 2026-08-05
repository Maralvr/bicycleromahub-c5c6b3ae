DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['booking_notes','guide_notes','field_updates','tasks','task_updates','staff','staff_unavailability','profiles','staff_rental_points','user_roles','rental_staff_notifications']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=tbl) THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', tbl);
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $$;

-- Harden staff self-update: replace the self-referential subquery check with an OLD/NEW trigger.
DROP POLICY IF EXISTS "staff_self_update" ON public.staff;
CREATE POLICY "staff_self_update" ON public.staff
  FOR UPDATE TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE OR REPLACE FUNCTION public.staff_block_self_privilege_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.role() = 'service_role' OR current_user IN ('postgres','supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.active IS DISTINCT FROM OLD.active
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
  THEN
    RAISE EXCEPTION 'Only admins can change staff role, active flag, duty status or account link';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS staff_block_self_privilege_change_trg ON public.staff;
CREATE TRIGGER staff_block_self_privilege_change_trg
  BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.staff_block_self_privilege_change();

REVOKE EXECUTE ON FUNCTION public.staff_block_self_privilege_change() FROM PUBLIC, anon, authenticated;