-- 1) Stop streaming full shift rows (incl. rate) over realtime postgres_changes.
ALTER PUBLICATION supabase_realtime DROP TABLE public.shifts;

-- 2) Column-level SELECT: everything except the customer payment rate.
REVOKE SELECT ON public.shifts FROM authenticated;
REVOKE SELECT ON public.shifts FROM anon;
GRANT SELECT (
  id, source, booking_id, tour_name, date, start_time, end_time, meeting_point,
  rental_point_id, customer_name, customer_phone, adults, teens, infants, trailers,
  notes, required_tags, assigned_staff_id, status, created_at, updated_at,
  channel_booking_ref, external_booking_ref, customer_email, seller, booking_channel,
  rate_title, participants, operations_notes, bokun_created_at, ticket_sent,
  bokun_product_id, payout_tier, payout_paid, payout_paid_at, payout_paid_by,
  pending_expires_at, requested_by, rejection_reason, rejected_by_staff_ids,
  reminder_24h_sent_at, reminder_2h_sent_at, no_show, no_show_reported_at,
  no_show_reported_by, no_show_notes, payout_amount, bokun_rate_id,
  cancelled_at, cancelled_reason, cancelled_by
) ON public.shifts TO authenticated;

-- 3) Admin-only rate lookup.
CREATE OR REPLACE FUNCTION public.shift_rates(_ids uuid[])
RETURNS TABLE(id uuid, rate numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.rate
  FROM public.shifts s
  WHERE s.id = ANY(_ids)
    AND public.has_role(auth.uid(), 'admin')
$$;

REVOKE ALL ON FUNCTION public.shift_rates(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shift_rates(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.shift_rates(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shift_rates(uuid[]) TO service_role;