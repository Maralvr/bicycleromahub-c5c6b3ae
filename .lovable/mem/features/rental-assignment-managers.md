---
name: Rental assignment managers
description: Non-admin accounts allowed to assign rental staff to rental points, and the no-limit rule
type: feature
---
Besides admins, designated accounts may assign/unassign rental staff to rental points on any day.

- Current list: `magnorobz@gmail.com`.
- DB truth: `public.can_manage_rental_assignments(uuid)` (admin OR email in list). Used by RLS policies `rpda_manager_all`, `rsu_manager_select`, `rstaff_manager_select` and by `cancel_rental_day`.
- Server functions in `src/lib/rental-staff.functions.ts` use `assertRentalManager` (RPC `can_manage_rental_assignments`), not `assertAdmin`.
- UI flag: `canManageRentalAssignments` from `useAuth()` (`RENTAL_MANAGER_EMAILS` in `src/lib/auth.tsx`); gates the roster button + day-assignment pills in the read-only rental-points view.
- Never cap how many rental staff can be assigned to a point on a given day — no UI guard, no DB check/trigger. Bookings on the Rental points page stay read-only for these managers.
