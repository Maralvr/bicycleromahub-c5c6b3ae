---
name: Rental staff pay rates
description: Two pay models for rental-point staff (flat + seasonal double-shift, and per-time-range), where they're computed and paid
type: feature
---
Rental staff are paid per DAY worked at a rental point (not per assignment).

Two models, resolved in `public.rental_staff_day_amounts(_from,_to)` (SECURITY DEFINER, gated to admin OR is_rental_staff):
- **Per-time-range**: if the staff member has any rows in `rental_staff_shift_rates`, each assignment's `(shift_start_time, shift_end_time)` is looked up there and summed for the day. (Sundar / yelurisundarpaul@gmail.com: 9-13 €30, 9-17 €50, 9-19 €60, 9-20 €80.)
- **Flat + seasonal double shift**: no rate rows → 1 shift = `rental_staff.default_shift_rate`; 2+ shifts = `double_shift_rate` when the date's MM-DD falls inside `[double_shift_season_start, double_shift_season_end]`, else `count × default_shift_rate`. (Aziz / wafimedaziz@gmail.com: €50 flat, €80 double, 06-15 → 08-31.)

Season bounds are MM-DD text, compared month/day only, so they recur yearly. Outside the window a double shift is just 2×flat — never a special rate.

Payment is tracked in `rental_staff_day_payouts` (one row per staff+date), written only via `public.set_rental_staff_day_payout` RPC. Marking paid freezes the amount (same freeze-on-paid pattern as guide payouts); UI must show the frozen amount for paid days.

UI: assignment pills in `src/components/rental-staff-panel.tsx` offer time quick-picks for rate-based staff and a no-time option for flat-rate staff. Settings at `/rental-staff-rates`; payouts section in `src/components/rental-staff-payouts.tsx` on `/payouts`.
