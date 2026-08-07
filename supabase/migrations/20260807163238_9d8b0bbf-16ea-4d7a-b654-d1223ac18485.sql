-- Safe, non-sensitive coworker directory (no email / phone / pay rates)
CREATE OR REPLACE FUNCTION public.rental_staff_names()
RETURNS TABLE(id uuid, name text, avatar text, active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rs.id, rs.name, rs.avatar, rs.active
  FROM public.rental_staff rs
  WHERE public.is_rental_staff(auth.uid())
     OR public.has_role(auth.uid(), 'admin')
$$;

REVOKE ALL ON FUNCTION public.rental_staff_names() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rental_staff_names() TO authenticated, service_role;

-- Rental staff may only read their own roster row from now on.
DROP POLICY IF EXISTS "rstaff_rental_staff_select_all" ON public.rental_staff;
CREATE POLICY "rstaff_rental_staff_select_own"
ON public.rental_staff
FOR SELECT
TO authenticated
USING (
  profile_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.can_manage_rental_assignments(auth.uid())
);

-- Payout amounts: own rows only for rental staff; admins/managers see all.
DROP POLICY IF EXISTS "rsdp_select" ON public.rental_staff_day_payouts;
CREATE POLICY "rsdp_select"
ON public.rental_staff_day_payouts
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.can_manage_rental_assignments(auth.uid())
  OR rental_staff_id IN (
    SELECT rs.id FROM public.rental_staff rs WHERE rs.profile_id = auth.uid()
  )
);