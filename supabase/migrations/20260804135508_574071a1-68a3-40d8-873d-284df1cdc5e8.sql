-- 1. Widen rental-staff booking visibility
DROP POLICY IF EXISTS shifts_rental_staff_select ON public.shifts;
CREATE POLICY shifts_rental_staff_select
  ON public.shifts FOR SELECT TO authenticated
  USING (public.is_rental_staff(auth.uid()));

-- 2. Rate-masking view: rate resolves to NULL for rental-staff-only callers
CREATE OR REPLACE VIEW public.shifts_rental_view
WITH (security_invoker = true) AS
SELECT
  s.id, s.source, s.booking_id, s.channel_booking_ref, s.external_booking_ref,
  s.tour_name, s.date, s.start_time, s.end_time, s.meeting_point,
  s.customer_name, s.customer_phone, s.customer_email,
  s.adults, s.teens, s.infants, s.trailers, s.participants,
  CASE
    WHEN public.is_rental_staff(auth.uid())
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
    THEN NULL
    ELSE s.rate
  END AS rate,
  s.rate_title, s.seller, s.booking_channel, s.notes, s.operations_notes,
  s.assigned_staff_id, s.status, s.required_tags, s.rental_point_id,
  s.no_show, s.no_show_reported_at, s.no_show_notes,
  s.cancelled_at, s.cancelled_reason,
  s.bokun_product_id, s.bokun_rate_id, s.ticket_sent,
  s.created_at, s.updated_at
FROM public.shifts s;

GRANT SELECT ON public.shifts_rental_view TO authenticated;
GRANT SELECT ON public.shifts_rental_view TO service_role;

-- 3. Restore rental-staff roster visibility (unintentionally dropped)
DROP POLICY IF EXISTS "rstaff_rental_staff_select_all" ON public.rental_staff;
CREATE POLICY "rstaff_rental_staff_select_all"
  ON public.rental_staff FOR SELECT TO authenticated
  USING (public.is_rental_staff(auth.uid()));