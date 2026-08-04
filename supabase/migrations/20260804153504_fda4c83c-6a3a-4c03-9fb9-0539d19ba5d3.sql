-- Rental staff must not read the base shifts table (rate/customer_email/
-- customer_phone would be readable via PostgREST and realtime). They read the
-- masked view instead, which nulls `rate` for rental-staff-only callers.
drop policy if exists shifts_rental_staff_select on public.shifts;

-- The view can no longer rely on the caller's own RLS (there is no base-table
-- policy for rental staff any more), so it runs with owner rights and does its
-- own audience check.
drop view if exists public.shifts_rental_view;

create view public.shifts_rental_view as
  select
    id, source, booking_id, channel_booking_ref, external_booking_ref,
    tour_name, date, start_time, end_time, meeting_point,
    customer_name, customer_phone, customer_email,
    adults, teens, infants, trailers, participants,
    case
      when public.is_rental_staff(auth.uid()) and not public.has_role(auth.uid(), 'admin') then null::numeric
      else rate
    end as rate,
    rate_title, seller, booking_channel, notes, operations_notes,
    assigned_staff_id, status, required_tags, rental_point_id,
    no_show, no_show_reported_at, no_show_notes,
    cancelled_at, cancelled_reason,
    bokun_product_id, bokun_rate_id, ticket_sent,
    created_at, updated_at
  from public.shifts s
  where public.has_role(auth.uid(), 'admin')
     or public.is_rental_staff(auth.uid());

revoke all on public.shifts_rental_view from anon;
grant select on public.shifts_rental_view to authenticated;
grant select on public.shifts_rental_view to service_role;