
-- Fix 1: Explicit admin-only INSERT policy on rental_staff_notifications
CREATE POLICY "rsnotif_admin_insert" ON public.rental_staff_notifications
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Fix 2: Tighten srp_self_insert to require the user is a rental_staff member
DROP POLICY IF EXISTS "srp_self_insert" ON public.staff_rental_points;
CREATE POLICY "srp_self_insert" ON public.staff_rental_points
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND is_primary = false
    AND EXISTS (
      SELECT 1 FROM public.rental_staff rs
      WHERE rs.profile_id = auth.uid() AND rs.active = true
    )
  );
