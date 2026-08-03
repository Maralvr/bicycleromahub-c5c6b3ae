CREATE POLICY rpda_rental_staff_select_all ON public.rental_point_day_assignments
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.rental_staff rs WHERE rs.profile_id = auth.uid()));

CREATE POLICY rstaff_rental_staff_select_all ON public.rental_staff
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.rental_staff rs WHERE rs.profile_id = auth.uid()));