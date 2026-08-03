# Guide double-booking prevention

## Critical finding first: "one departure = many shift rows"

Every Bokun booking becomes its own row in `shifts`. A single 08:00–12:30 Appia Antica departure with three bookings is three rows, all legitimately led by the same guide. A naive "same date + overlapping times" rule would flag those as conflicts and block the most common assignment in the app.

Live-data audit (query run, not guessed): **31 overlapping pairs today**.
- 15 are the exact same departure (identical product + identical start/end) — legitimate.
- 16 look "genuine" only by product id, but on inspection 13 of them are still the same departure sold under two product variants (e.g. "Appia Antica and Catacombs …" vs "Appia Antica, Aqueducts and Catacombs …" both 16:00–20:30).
- Only **3 are real double-bookings**, all one guide (marallvrr) on 2026-06-19 with genuinely different tours at 08:00/08:30/09:00 — and all in the past.
- Real conflicts in the future: **0**.

So the guard must key on *departure identity*, not on raw time overlap.

## 1. Enforcement layer

Database trigger, mirroring the existing `shifts_block_sensitive_update` pattern:

- `public.guide_has_conflict(_staff_id uuid, _date date, _start time, _end time, _exclude_shift_id uuid)` — `SECURITY DEFINER`, `STABLE`, returns the conflicting shift id or null. Single source of truth reused by triggers *and* the UI.
- `shifts_block_guide_conflict` — `BEFORE INSERT OR UPDATE ON shifts`, fires only when `assigned_staff_id` is newly set/changed and is not null.
- `sag_block_guide_conflict` — `BEFORE INSERT OR UPDATE ON shift_additional_guides`.
- Both raise `EXCEPTION ... ERRCODE = '23P01'` with a message naming the clashing tour + time, so the client can surface it verbatim.

Why not an exclusion constraint (`EXCLUDE USING gist (staff_id WITH =, tsrange WITH &&)`): it is cleaner in principle but wrong here — it cannot express the same-departure exemption, cannot ignore rejected/cancelled rows without a partial-index predicate that Postgres won't allow over the mutable status set, and would need a generated `tsrange` column plus a second table (additional guides) that the constraint can't see. Cross-table + conditional logic means a trigger. Tradeoff accepted: triggers are not race-proof by themselves, so the function takes a `pg_advisory_xact_lock(hashtext(staff_id||date))` before checking, which serialises concurrent admins on the same guide/day.

## 2. What counts as overlapping

- Same date, `start1 < end2 AND start2 < end1`. Back-to-back (12:00 end / 12:00 start) is allowed — confirmed correct.
- **Exemption:** rows that represent the same departure — same date, same `start_time`, same `end_time`, and same `bokun_product_id` OR same `tour_name` — never conflict. This is what makes the rule usable at all (see the audit above).
- No travel buffer in v1. A buffer would immediately flag legitimate 12:00→12:00 turnarounds between Circus Maximus and Lungotevere. If you want it, it should be a configurable minutes value defaulting to 0 — say the word and I'll add the column.

## 3. Which shifts block time

Only live commitments:
- `shifts`: `status IN ('pending','accepted')`. `unassigned` and `rejected` never hold a guide anyway; `no_show = true` still blocks (the guide did show up and work the slot — the *customer* no-showed).
- `shift_additional_guides`: `status IN ('pending','accepted')`; `rejected` frees the slot.

## 4. Partner tours

No special-casing. Livitaly is already blocked from assignment in the UI, and Le Meridien / Roma 'n Bike stay assignable. If a partner tour does get a guide, it counts as busy time like anything else — the trigger is product-agnostic by design.

## 5. UX (proactive, trigger as backstop)

Server function `getBusyStaffIds({ date, startTime, endTime, excludeShiftId })` calling the same SQL helper, then:
- `src/components/assign-guide-combobox.tsx` — busy guides greyed out, non-selectable, with "Busy: <tour> 08:00–12:30".
- `src/components/smart-assign-dialog.tsx` — busy guides dropped from suggestions (or ranked last with the reason shown).
- `src/components/bulk-dispatch-dialog.tsx` — conflict check per row before dispatch; conflicting rows marked and skipped, count reported. Also guards against the dialog assigning one guide to two overlapping rows inside the same batch.
- `src/lib/shifts-store.tsx` `assignShift` — surface the trigger's error message as a toast instead of a generic failure.

## 6. Existing conflicts

Answered in the audit above: 0 future real conflicts, so the trigger can go live hard with no grandfathering. It fires `BEFORE INSERT OR UPDATE` and only when the guide changes, so existing rows are never revalidated and past data is untouched.

## Technical notes

- One migration: helper function + two triggers + grants.
- Trigger skips when `auth.role() = 'service_role'` / `current_user IN ('postgres','supabase_admin')` so the Bokun importer and webhook can never be blocked by it, same escape hatch as `shifts_block_sensitive_update`.
- Admins are *not* exempt: this is a data-integrity rule, not a permission. An explicit override would need its own follow-up decision.
