-- 1. guide_payout_rates: widen read + write to rental staff (no customer PII in this table)
DROP POLICY IF EXISTS gpr_select ON public.guide_payout_rates;
CREATE POLICY gpr_select ON public.guide_payout_rates
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR public.is_rental_staff(auth.uid()));

DROP POLICY IF EXISTS gpr_admin_write ON public.guide_payout_rates;
CREATE POLICY gpr_admin_write ON public.guide_payout_rates
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR public.is_rental_staff(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR public.is_rental_staff(auth.uid()));

-- 2. shift_additional_guides: rental staff can read every additional-guide payout line
DROP POLICY IF EXISTS shift_additional_guides_staff_select ON public.shift_additional_guides;
CREATE POLICY shift_additional_guides_staff_select ON public.shift_additional_guides
  FOR SELECT TO authenticated
  USING (
    (staff_id IN (SELECT staff.id FROM public.staff WHERE staff.profile_id = auth.uid()))
    OR public.is_primary_guide_for_shift(shift_id, auth.uid())
    OR public.is_rental_staff(auth.uid())
  );

-- 3. Payout-only write RPCs (no blanket table write grant for rental staff)
CREATE OR REPLACE FUNCTION public.set_shift_payout(
  _shift_id uuid,
  _tier integer DEFAULT NULL,
  _paid boolean DEFAULT NULL,
  _amount numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR public.is_rental_staff(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.shifts
     SET payout_tier    = COALESCE(_tier, payout_tier),
         payout_paid    = COALESCE(_paid, payout_paid),
         payout_paid_at = CASE
                            WHEN _paid IS NULL THEN payout_paid_at
                            WHEN _paid THEN now()
                            ELSE NULL
                          END,
         payout_paid_by = CASE
                            WHEN _paid IS NULL THEN payout_paid_by
                            WHEN _paid THEN auth.uid()
                            ELSE NULL
                          END,
         payout_amount  = CASE
                            WHEN _paid IS NULL THEN payout_amount
                            WHEN _paid THEN _amount
                            ELSE NULL
                          END
   WHERE id = _shift_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_shift_payout(uuid, integer, boolean, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_shift_payout(uuid, integer, boolean, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_additional_guide_payout(
  _row_id uuid,
  _tier integer DEFAULT NULL,
  _paid boolean DEFAULT NULL,
  _amount numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR public.is_rental_staff(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.shift_additional_guides
     SET payout_tier    = COALESCE(_tier, payout_tier),
         payout_paid    = COALESCE(_paid, payout_paid),
         payout_paid_at = CASE
                            WHEN _paid IS NULL THEN payout_paid_at
                            WHEN _paid THEN now()
                            ELSE NULL
                          END,
         payout_amount  = CASE
                            WHEN _paid IS NULL THEN payout_amount
                            WHEN _paid THEN _amount
                            ELSE NULL
                          END
   WHERE id = _row_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Additional guide line not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_additional_guide_payout(uuid, integer, boolean, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_additional_guide_payout(uuid, integer, boolean, numeric) TO authenticated;