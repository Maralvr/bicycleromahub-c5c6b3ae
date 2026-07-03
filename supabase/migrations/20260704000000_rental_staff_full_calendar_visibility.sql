-- Give rental staff the same booking visibility admins have for rental points.
--
-- Previously "shifts_rental_staff_select" only let a rental staff member read
-- shifts tied to the ONE rental point + day they were personally assigned to
-- via rental_point_day_assignments. That meant the "Rental points" read-only
-- view could only ever show a single day's worth of bookings at a single
-- point -- not "all calendars for each rental point" the way admins see them.
--
-- This widens the policy so any authenticated rental_staff account can read
-- every shift row that belongs to a rental point (rental_point_id IS NOT
-- NULL), regardless of which point/day they're personally assigned to.
-- Write access (UPDATE/DELETE) is untouched -- those stay admin-only, so the
-- view remains read-only for rental staff as previously decided.
DROP POLICY IF EXISTS "shifts_rental_staff_select" ON public.shifts;
CREATE POLICY "shifts_rental_staff_select" ON public.shifts FOR SELECT TO authenticated
USING (
  rental_point_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.rental_staff rs WHERE rs.profile_id = auth.uid())
);

-- The rental bookings calendar shows the name/avatar of whichever guide is
-- assigned to a booking (shifts.assigned_staff_id), same as the admin view.
-- The existing "staff_select" policy only lets a non-admin see their OWN
-- staff row, so without this, rental staff would see every rental-point
-- shift but with the assigned guide's identity blanked out.
--
-- Scope this narrowly: rental staff can see a staff row only if that staff
-- member is actually assigned to at least one rental-point shift. This
-- avoids exposing the full guide roster (with phone/email) to rental staff
-- -- only the guides they'd actually see on a rental-point booking.
DROP POLICY IF EXISTS "staff_select_rental_staff" ON public.staff;
CREATE POLICY "staff_select_rental_staff" ON public.staff FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.rental_staff rs WHERE rs.profile_id = auth.uid())
  AND id IN (
    SELECT assigned_staff_id FROM public.shifts
    WHERE rental_point_id IS NOT NULL AND assigned_staff_id IS NOT NULL
  )
);
