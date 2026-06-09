
-- 1) Restrict guide_payout_rates SELECT to admins only
DROP POLICY IF EXISTS gpr_select ON public.guide_payout_rates;
CREATE POLICY gpr_select ON public.guide_payout_rates
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 2) Revoke EXECUTE from PUBLIC/anon on SECURITY DEFINER functions that should not be publicly callable
REVOKE EXECUTE ON FUNCTION public.accept_shift(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_shift(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_shift_dispatch_event() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_shift_dispatch_on_insert() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notify_shift_assignment() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notify_shift_assignment_on_insert() FROM PUBLIC, anon;
