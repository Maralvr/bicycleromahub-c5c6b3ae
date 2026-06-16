---
name: Rental-point staff
description: Separate roster, per-day assignments, integrated into shifts calendar via render-prop bridge
type: feature
---
Rental-point staff are non-guide workers assigned per day per rental point. Tables: `rental_staff`, `rental_point_day_assignments`, `rental_staff_notifications`. Role: `rental_staff` (in `app_role`).

UI integration (admin, rental-points page):
- `useRentalStaffBridge(pointId)` in `src/components/rental-staff-panel.tsx` returns `{ renderDayOverlay, renderDayDialogSection, ManageRosterButton }`.
- Wired into `ShiftsCalendar` via `renderDayOverlay` (avatar stack in month-view day cells) and `renderDayDialogSection` (toggle pills inside DayDetailsDialog).
- No standalone day-card panel — assignment lives inside the existing calendar.

Staff view: `RentalStaffShiftsView` swaps the Shifts page when role=rental_staff. Bell: `RentalNotificationBell`. Cron reminders via `send_rental_point_reminders()` RPC.
