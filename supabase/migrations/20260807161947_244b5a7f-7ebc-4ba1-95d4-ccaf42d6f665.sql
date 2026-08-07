DROP POLICY IF EXISTS gpr_admin_write ON public.guide_payout_rates;
CREATE POLICY gpr_admin_write ON public.guide_payout_rates FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR public.can_manage_rental_assignments(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR public.can_manage_rental_assignments(auth.uid()));

DROP POLICY IF EXISTS rssr_write ON public.rental_staff_shift_rates;
CREATE POLICY rssr_write ON public.rental_staff_shift_rates FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR public.can_manage_rental_assignments(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR public.can_manage_rental_assignments(auth.uid()));