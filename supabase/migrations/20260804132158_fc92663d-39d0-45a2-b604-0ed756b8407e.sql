DROP POLICY IF EXISTS "rstaff_rental_staff_select_all" ON public.rental_staff;
-- rstaff_self_select (profile_id = auth.uid()) and rstaff_admin_all remain:
-- rental staff can now only read their own record; admins keep full access.