# Shift Request Flow

A new "Request" action lets admins propose a shift to a guide who hasn't submitted availability. The guide gets a notification with Accept / Reject, the admin is notified of the response, and pending requests expire after 2 hours.

## Database changes

- Add `'requested'` to the `shift_status` enum.
- Add columns on `shifts`: `requested_at`, `requested_expires_at`, `requested_by` (admin uuid).
- New RPC functions (all `security definer`):
  - `request_shift(shift_id, staff_id)` — admin-only, sets status `requested`, assigns the guide, stamps 2h expiry, inserts a notification for the guide.
  - `accept_shift_request(shift_id)` — guide-only, flips status to `assigned`, clears request timestamps, notifies admins.
  - `reject_shift_request(shift_id)` — guide-only, clears the assignment, sets status back to `unassigned`, notifies admins.
  - `cancel_shift_request(shift_id)` — admin-only, clears the assignment, notifies the previously-requested guide.
- A pg_cron job (every 5 minutes) calls a new `expire_shift_requests()` function that auto-rejects pending requests past `requested_expires_at` and notifies admins.

## UI changes

- **Smart-assign dialog**: each candidate row now shows two actions — **Assign** and **Request**. When the guide has no availability record for that date, the **Request** button becomes the primary highlighted action; otherwise **Assign** stays primary.
- **Shift card / calendar**: shifts in `requested` state get a distinct "Requested" badge with a countdown to expiry and an "Cancel request" action for admins.
- **Guide notification bell**: notifications of type `shift_request` render inline **Accept** and **Reject** buttons that call the corresponding RPCs.
- **Admin notification bell**: receives notifications when a guide accepts, rejects, or a request expires.

## Out of scope

- No SMS/email — only in-app notifications.
- No reassign UI flow beyond the existing smart-assign dialog reopening on cancel/reject.
- No history log beyond the existing activity feed entry that the response will append.
