# Rental staff: live updates + visible cancellations

Two gaps, one shared root cause: the rental staff view is a snapshot, and every removal path erases the row, so a removal is indistinguishable from "never existed".

## Part 1 — Realtime in the rental staff view

`RentalStaffShiftsView` fetches once via `getMyRentalDays()`. Add a `postgres_changes` subscription mirroring `useRentalShifts()`:

- One channel, created in a `useEffect` with `[]`-stable deps, torn down with `supabase.removeChannel` on unmount (per the realtime billing rule — never at component scope).
- Two listeners on that channel:
  - `shifts` (event `*`) — bookings added/edited/removed at any of the staff member's points.
  - `rental_point_day_assignments` (event `*`) — their day assignments granted/changed/removed.
- Handler strategy: **debounced refetch** (~400 ms) of `getMyRentalDays()` rather than patching local state. The view's shape is a server-computed join (assignment + its bookings + guides), so reconstructing it client-side from a raw row payload would duplicate server logic and drift. Refetch is one small server call per burst.
- Relevance filter before refetching, so an unrelated admin edit elsewhere doesn't cause a fetch: keep a ref of the staff member's `{assignmentIds, rentalPointIds, dates}` from the last load and only refetch when the payload's `rental_staff_id` / `rental_point_id` / `date` (or `old` values for DELETE) intersect it. When a payload lacks enough info (DELETE payloads only carry replica-identity columns, usually just `id`), fall back to refetching if the id is one we already show.

## Part 2 — Visible cancellation

### Option A — soft delete (recommended)

Stop hard-deleting; mark the row.

- `shifts`: add `cancelled_at timestamptz`, `cancelled_reason text`, `cancelled_by uuid`. All read paths filter `cancelled_at is null` **except** the rental staff day view and the admin day detail, which keep cancelled rows for a bounded window (proposal: still shown while `date >= today - 2 days`) rendered greyed with a "Cancelled" badge.
- `rental_point_day_assignments`: it already has a `status` column with a `rejected` state — add `cancelled` and set it instead of deleting, plus reuse `rejection_reason` or add `cancelled_reason`.
- Bokun cancel webhook sets `cancelled_at = now()` instead of `.delete()`. Re-booking of the same Bokun ref clears `cancelled_at` (un-cancel) rather than inserting a duplicate.
- Admin `deleteShift` becomes "cancel" for Bokun-sourced rows; a true hard delete stays available for manual rows created by mistake (admin-only).

Tradeoffs: needs a migration + an audit of every `from("shifts").select` to add the `cancelled_at is null` filter (miss one and cancelled bookings reappear on the main calendar). In exchange: payout reconciliation can still see that a paid/partly-worked booking was cancelled; dispatch/audit history stays intact (`shift_dispatch_events` currently FKs to `shifts` and loses rows on delete); the staff member sees a persistent "Cancelled" row instead of needing to have been looking at the screen.

### Option B — hard delete + live notice (lighter)

Keep `.delete()`. The realtime DELETE handler shows a toast, and the removal paths also insert a `rental_staff_notifications` row (`type: 'unassigned'`) so the notice survives being offline — the assignment-delete path already does this via the `rpda_notify_del` trigger; extend the same idea to shift deletion.

Tradeoffs: no migration on `shifts`, no read-path audit, no risk of cancelled rows leaking into calendars. But nothing downstream can reconstruct what was cancelled: payouts for a cancelled-late booking, and dispatch history, are gone. The badge is impossible — you get a notice, not a state.

### Recommendation

**A for `shifts` and `rental_point_day_assignments`, plus B's notification for delivery.** The deciding factor is downstream need: payouts (`payout_paid`, `payout_amount` live on `shifts`) and `shift_dispatch_events` both reference rows that hard-delete currently destroys, so a late cancellation of an already-dispatched, already-owed booking loses money-relevant history today. That alone justifies the migration. Layering the notification on top means the staff member learns about it even if they weren't on the page.

If you'd rather avoid touching every `shifts` read path right now, B alone is a legitimate smaller step and Part 1 still fixes the "nothing ever updates" complaint.

## Consistency across all three removal paths

| Path | Today | After |
| --- | --- | --- |
| `unassignRentalStaff` (`src/lib/rental-staff.functions.ts`) | hard delete | `status = 'cancelled'`, reason recorded, notification |
| `deleteShift` (`src/lib/shifts-store.tsx`) | hard delete | `cancelled_at = now()` (hard delete only for manual rows) |
| Bokun cancel (`supabase/functions/bokun-webhook/index.ts`, both branches at ~487 and ~516) | hard delete | `cancelled_at = now()`, un-cancel on re-book |

## Technical notes

- Migration: nullable columns only, no backfill needed; enum-free (`rental_point_day_assignments.status` is `text`).
- Realtime must already be on both tables in `supabase_realtime`; verify and add if missing.
- Read-path audit list to update with `cancelled_at is null`: `shifts-store.tsx`, `rental-shifts.ts`, `live-shifts.ts`, `payouts`, `smart-assign`/`busy_guides` SQL (a cancelled booking must stop blocking a guide's availability), and the calendar count shown on the rental points page.
