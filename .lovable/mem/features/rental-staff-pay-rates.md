---
name: Rental staff pay rates
description: Two pay models for rental-point staff (flat + seasonal double-shift, and per-time-range), fixed-salary staff, where they're computed and paid
type: feature
---
Rental staff are paid per DAY worked at a rental point (not per assignment).

Resolved in `public.rental_staff_day_amounts(_from,_to)` (SECURITY DEFINER, gated to admin OR is_rental_staff), in this precedence:
1. **Double-shift day**: 2+ accepted shifts that day AND `double_shift_rate` set AND (no season window OR date's MM-DD inside `[double_shift_season_start, double_shift_season_end]`) → `double_shift_rate`. Applies to BOTH pay models.
2. **Per-time-range**: staff has rows in `rental_staff_shift_rates` → each assignment's `(shift_start_time, shift_end_time)` is looked up there and summed.
3. **Flat**: `shift_count × default_shift_rate`.

Season bounds are MM-DD text, month/day only, so they recur yearly.

Current people:
- Aziz (wafimedaziz@gmail.com): time ranges 8:30–13 €50, 9–13 €30, 9–17 €50, 9–19 €50, 16–20:30 €50; double-shift day €80 (season 06-15 → 08-31); `default_shift_rate` 50 as fallback for no-time assignments.
- Sundar (yelurisundarpaul@gmail.com): 9–13 €30, 9–17 €50, 9–19 €60, 9–20 €80.
- magnorobz@gmail.com: **fixed monthly salary** — has time ranges with amount 0 purely so admins can record which shift he worked. Zero-amount ranges hide the € label in the assignment picker; payouts show €0 by design.

Payment tracked in `rental_staff_day_payouts` (one row per staff+date), written only via `public.set_rental_staff_day_payout` RPC. Marking paid freezes the amount; UI must show the frozen amount for paid days.

UI: assignment pills in `src/components/rental-staff-panel.tsx` (time quick-picks for staff with rate rows, morning/afternoon quick-picks for flat-rate staff, "No time" option). Settings at `/rental-staff-rates`; payouts in `src/components/rental-staff-payouts.tsx` on `/payouts`.
