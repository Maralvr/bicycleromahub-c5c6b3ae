## Goal

Make the assign/accept/reject loop fully observable for admins, and let guides reject with an optional reason that's preserved (with authorship) in the booking notes thread.

## Changes

### 1. Database (already applied)
Added two values to the `notification_type` enum: `shift_accepted` and `shift_rejected`. No further schema changes needed — we reuse `guide_notifications` (fan out one row per admin) and `booking_notes` (for the rejection reason).

### 2. `src/lib/notes-store.tsx`
- Extend the `GuideNotification.type` union with `"shift_accepted"` and `"shift_rejected"`.

### 3. `src/routes/shifts.tsx` — Guide accept flow
- On Accept, after the status update, fan out a notification to every staff row whose `role === "admin"` (using existing `notifyGuides`):
  - type: `shift_accepted`, title: `"{Guide name} accepted a shift"`, body: tour summary, link: `/shifts`.

### 4. `src/routes/shifts.tsx` — Guide reject flow (with optional note)
- Replace the bare "Reject" button on the guide's shift card with one that opens a small reject dialog (new local component, same styling as `LeaveNoteDialog`).
- Dialog fields: optional reason textarea + optional attachments (`AttachmentPicker`) + Confirm/Cancel.
- On Confirm:
  1. If a reason or attachment is provided, insert a `booking_notes` row authored by the guide (`author_profile_id = user.id`, `author_role = "guide"`, message prefixed with `"Rejected this shift:"`), so it appears in the existing booking notes thread with author + timestamp.
  2. Call the existing `reject_shift` RPC (releases the shift back to the unassigned pool).
  3. Fan out a `shift_rejected` notification to every admin: title `"{Guide} rejected a shift"`, body includes tour summary + (truncated) reason if provided, link `/shifts`.
  4. Toast the guide: "Shift released — admin notified."

### 5. `src/routes/shifts.tsx` — Unassign by admin (already notifies the guide)
- Confirm the existing `handleUnassign` path already sends a `unassigned` notification to the affected guide — no change needed, just verifying.

### 6. No email/push
Per your instruction, in-app only for now. We'll wire email later when you decide.

## Files touched

- `src/lib/notes-store.tsx` — type union extension only.
- `src/routes/shifts.tsx` — add `notifyAdmins` helper, reject dialog state + component, modify `updateStatus`, wire onReject to open dialog.

## Out of scope

- No changes to booking_notes schema, RLS, or the existing thread component.
- No email/push.
- No changes to admin's existing reassign / assign-with-note flow.
