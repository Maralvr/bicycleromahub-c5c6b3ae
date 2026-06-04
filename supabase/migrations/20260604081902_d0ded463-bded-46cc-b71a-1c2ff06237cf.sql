
-- 1. SHIFTS: restrict SELECT to admin or assigned guide
DROP POLICY IF EXISTS shifts_select ON public.shifts;
CREATE POLICY shifts_select ON public.shifts FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR assigned_staff_id IN (SELECT id FROM public.staff WHERE profile_id = auth.uid())
);

-- 2. SHIFTS: prevent non-admin assigned guide from updating sensitive columns
CREATE OR REPLACE FUNCTION public.shifts_block_sensitive_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.rate IS DISTINCT FROM OLD.rate
    OR NEW.customer_email IS DISTINCT FROM OLD.customer_email
    OR NEW.customer_phone IS DISTINCT FROM OLD.customer_phone
    OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
    OR NEW.booking_id IS DISTINCT FROM OLD.booking_id
    OR NEW.channel_booking_ref IS DISTINCT FROM OLD.channel_booking_ref
    OR NEW.external_booking_ref IS DISTINCT FROM OLD.external_booking_ref
    OR NEW.assigned_staff_id IS DISTINCT FROM OLD.assigned_staff_id
    OR NEW.tour_name IS DISTINCT FROM OLD.tour_name
    OR NEW.date IS DISTINCT FROM OLD.date
    OR NEW.start_time IS DISTINCT FROM OLD.start_time
    OR NEW.end_time IS DISTINCT FROM OLD.end_time
    OR NEW.rate_title IS DISTINCT FROM OLD.rate_title
    OR NEW.participants::text IS DISTINCT FROM OLD.participants::text
    OR NEW.adults IS DISTINCT FROM OLD.adults
    OR NEW.teens IS DISTINCT FROM OLD.teens
    OR NEW.infants IS DISTINCT FROM OLD.infants
    OR NEW.trailers IS DISTINCT FROM OLD.trailers
    OR NEW.seller IS DISTINCT FROM OLD.seller
    OR NEW.booking_channel IS DISTINCT FROM OLD.booking_channel
    OR NEW.source IS DISTINCT FROM OLD.source
    OR NEW.rental_point_id IS DISTINCT FROM OLD.rental_point_id
  THEN
    RAISE EXCEPTION 'Non-admin users cannot modify protected shift fields';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS shifts_block_sensitive_update_trg ON public.shifts;
CREATE TRIGGER shifts_block_sensitive_update_trg
BEFORE UPDATE ON public.shifts
FOR EACH ROW EXECUTE FUNCTION public.shifts_block_sensitive_update();

-- 3. INVOICES: admin only (drop the open SELECT; invoices_admin_all covers admins)
DROP POLICY IF EXISTS invoices_select ON public.invoices;

-- 4. WAIVER SIGNATURES: scope to admin or shift assigned to user
DROP POLICY IF EXISTS ws_select ON public.waiver_signatures;
CREATE POLICY ws_select ON public.waiver_signatures FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR matched_shift_id IN (
    SELECT s.id FROM public.shifts s
    JOIN public.staff st ON st.id = s.assigned_staff_id
    WHERE st.profile_id = auth.uid()
  )
);

-- 5. GUIDE NOTES: scope to admin, author, or assigned shift
DROP POLICY IF EXISTS gn_select ON public.guide_notes;
CREATE POLICY gn_select ON public.guide_notes FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR author_staff_id IN (SELECT id FROM public.staff WHERE profile_id = auth.uid())
  OR shift_id IN (
    SELECT s.id FROM public.shifts s
    JOIN public.staff st ON st.id = s.assigned_staff_id
    WHERE st.profile_id = auth.uid()
  )
);

-- 6. TASK UPDATES: scope to admin, author, or task assignee
DROP POLICY IF EXISTS tu_select ON public.task_updates;
CREATE POLICY tu_select ON public.task_updates FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR author_staff_id IN (SELECT id FROM public.staff WHERE profile_id = auth.uid())
  OR task_id IN (
    SELECT t.id FROM public.tasks t
    JOIN public.staff st ON st.id = t.assigned_to
    WHERE st.profile_id = auth.uid()
  )
);

-- 7. FIELD UPDATES: scope to admin or author
DROP POLICY IF EXISTS fu_select ON public.field_updates;
CREATE POLICY fu_select ON public.field_updates FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR author_id = auth.uid()
  OR author_id IN (SELECT id FROM public.staff WHERE profile_id = auth.uid())
);

-- 8. STAFF: non-admin only sees own record
DROP POLICY IF EXISTS staff_select ON public.staff;
CREATE POLICY staff_select ON public.staff FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR profile_id = auth.uid()
);

-- 9. PROFILES: non-admin only sees own profile
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR id = auth.uid()
);

-- 10. TASKS: non-admin only sees tasks assigned to them
DROP POLICY IF EXISTS tasks_select ON public.tasks;
CREATE POLICY tasks_select ON public.tasks FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR assigned_to IN (SELECT id FROM public.staff WHERE profile_id = auth.uid())
);

-- 11. STAFF UNAVAILABILITY: non-admin only sees own
DROP POLICY IF EXISTS unavail_select ON public.staff_unavailability;
CREATE POLICY unavail_select ON public.staff_unavailability FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR staff_id IN (SELECT id FROM public.staff WHERE profile_id = auth.uid())
);

-- 12. STAFF RENTAL POINTS: non-admin only sees own
DROP POLICY IF EXISTS srp_select ON public.staff_rental_points;
CREATE POLICY srp_select ON public.staff_rental_points FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
);

-- 13. REALTIME: remove sensitive tables from the publication so row-change events
--     don't bypass the new SELECT policies. Keep guide_notifications (per-user RLS)
--     and rental_points (non-sensitive reference data).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'shifts','invoices','waiver_signatures','staff','tasks','task_updates',
    'guide_notes','field_updates','staff_unavailability','staff_rental_points',
    'user_roles','booking_notes'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;

-- 14. SECURITY DEFINER function grants: restrict execution
REVOKE ALL ON FUNCTION public.next_invoice_number(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_bokun_cron_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_shift(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;

-- Keep these callable by app code where needed
GRANT EXECUTE ON FUNCTION public.reject_shift(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
