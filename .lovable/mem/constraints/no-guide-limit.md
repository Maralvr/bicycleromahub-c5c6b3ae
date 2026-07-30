---
name: No cap on guides per tour
description: Admins can assign unlimited additional guides to a shift — never add a count limit in UI or DB
type: constraint
---

Never introduce a maximum number of guides per shift/tour. The primary guide plus any number of `shift_additional_guides` rows must be allowed.

- No `length >=` guards hiding the "Add another guide" picker in `src/routes/shifts.tsx`.
- No CHECK constraint / trigger counting rows in `public.shift_additional_guides` (only the existing `unique (shift_id, staff_id)`, which just prevents duplicates of the same guide).

**Why:** Some bookings genuinely need 3+ guides; the admin decides, not the app.
