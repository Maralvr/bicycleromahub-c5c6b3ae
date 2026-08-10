CREATE OR REPLACE FUNCTION public.shifts_block_sensitive_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
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
    OR NEW.payout_tier IS DISTINCT FROM OLD.payout_tier
    OR NEW.payout_paid IS DISTINCT FROM OLD.payout_paid
    OR NEW.payout_paid_at IS DISTINCT FROM OLD.payout_paid_at
    OR NEW.payout_paid_by IS DISTINCT FROM OLD.payout_paid_by
    OR NEW.payout_amount IS DISTINCT FROM OLD.payout_amount
    OR NEW.no_show IS DISTINCT FROM OLD.no_show
    OR NEW.no_show_reported_at IS DISTINCT FROM OLD.no_show_reported_at
    OR NEW.no_show_reported_by IS DISTINCT FROM OLD.no_show_reported_by
    OR NEW.no_show_notes IS DISTINCT FROM OLD.no_show_notes
    OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
    OR NEW.cancelled_reason IS DISTINCT FROM OLD.cancelled_reason
  THEN
    RAISE EXCEPTION 'Non-admin users cannot modify protected shift fields';
  END IF;
  RETURN NEW;
END
$$;