## Goal

Let admins assign rental-point staff (separate from tour guides) to a rental point on a given date. Each assigned person sees the bookings for that day and which guides are showing up, plus gets the same notification + reminder treatment guides already get.

## Data model

New tables:

- `rental_staff` — separate roster, not in `staff`.
  - `name`, `email`, `phone`, `avatar` (initials), `active`, `profile_id` (nullable, links to `auth.users` once they sign in).
- `rental_point_day_assignments` — one row per (rental_point, staff, date). Multiple staff per point per day allowed; unique constraint prevents duplicates.
  - `rental_point_id`, `rental_staff_id`, `date`, `notes`, `created_by`.
- `rental_staff_notifications` — mirror of `guide_notifications` but scoped to rental staff (so the existing guide bell logic stays untouched).
  - Columns: `rental_staff_id`, `type` (assigned / unassigned / reminder), `title`, `body`, `rental_point_id`, `date`, `link`, `read`.

Auth/role:

- Add `'rental_staff'` to the `app_role` enum.
- `handle_new_user` stays as-is (creates a tour guide by default). When an admin invites a rental staff person, the admin form pre-creates the `rental_staff` row by email; on first sign-in we match `auth.users.email` → `rental_staff.email`, set `profile_id`, grant the `rental_staff` role.

Reminders:

- New SQL function `send_rental_point_reminders()` — same shape as `send_shift_reminders()` but reads `rental_point_day_assignments` joined to `shifts` for that date/rental point, and writes into `rental_staff_notifications`. Wire it into the existing cron the same way.

## Server functions (`src/lib/rental-staff.functions.ts`, `src/lib/rental-assignments.functions.ts`)

Admin (require `admin` role inside handler):

- `listRentalStaff`, `upsertRentalStaff`, `deactivateRentalStaff`.
- `listAssignmentsForPoint(pointId, from, to)` — for the rental-point calendar.
- `assignRentalStaff({ pointId, staffId, date, notes? })` / `unassignRentalStaff({ assignmentId })` — writes assignment + inserts a notification row (and the push trigger fires off the existing push pipeline).

Rental staff (require auth, look up their `rental_staff` row by `profile_id`):

- `getMyRentalDays({ from, to })` — returns assignments + the bookings on that point/date + assigned guides.
- `markRentalNotificationRead`.

Push: extend `push.server.ts` so rental-staff notifications go through the same VAPID pipeline using their own `push_subscriptions` rows (we'll key subscriptions by `profile_id` which already exists).

## Frontend

Admin — `/rental-points`:

- New **Staff** tab on each rental point: list current rental staff (across all points), add/edit/deactivate, and per-point quick-pick to set who is allowed there.
- On the existing **Calendar** tab: each day cell gets a small "Rental staff" row with chips for assigned people and a `+` button that opens a picker (multi-select from `rental_staff`). Removing a chip unassigns.

Rental staff — reuse `/shifts`:

- When `useCurrentUser().role === 'rental_staff'`, the page swaps its data source to `getMyRentalDays`. Each card shows:
  - Rental point name + date + admin notes.
  - All bookings on that point/date (tour, time, pax, customer).
  - Assigned guide(s) per booking (name + avatar, read-only — no rate, per the project rule).
- Notification bell on the app shell reads from `rental_staff_notifications` for this role.
- Sidebar nav stays the same — Shifts entry already exists.

App shell:

- Admin toggle ("Switch to guide view") gets a third option for rental-staff view so the admin can preview what they see.

## Notifications + reminders

- Assignment insert/delete trigger writes into `rental_staff_notifications` (same as the guide trigger pattern).
- New cron `send_rental_point_reminders()` invoked from the existing reminder edge route alongside `send_shift_reminders()`. 24h + 2h windows.
- Push subscriptions: reuse the `push_subscriptions` table keyed by `profile_id`.

## Out of scope (will not change in this pass)

- Bokun import flow.
- Existing guide assignment logic and `shifts` table schema.
- Rate visibility — rental staff also do not see `shift.rate` (same admin-only rule already in memory).

## Roll-out order

1. Migration: enum value, three tables, GRANTs + RLS, triggers, reminder function.
2. Server functions + push wiring.
3. Admin UI on `/rental-points` (Staff tab + calendar chips).
4. Rental-staff view in `/shifts` + notification bell adapter + role toggle.
5. Manual smoke test: create a rental staff person, assign to a point/date, confirm notification, sign in as them, confirm the day + bookings + guides are visible.
