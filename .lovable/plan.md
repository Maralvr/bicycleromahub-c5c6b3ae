## Problem

On hard refresh, the app sometimes shows the guide view for a split second before snapping back to the admin view. Root cause is a race in `src/lib/auth.tsx`:

- `onAuthStateChange` fires immediately with `INITIAL_SESSION` and calls `setLoading(false)` right away.
- The actual roles fetch (`loadUserData`) is deferred with `setTimeout(..., 0)` and runs **after** loading is already false.
- During that gap, `isAdmin` is `false`, so `useCurrentUser` resolves `role = "staff"`. Pages like `/calendar` even `<Navigate to="/shifts" />` based on this, and `/shifts` renders the "My shifts" guide layout.

The existing `AuthGate` only waits on `loading`, not on roles, so the guide UI flashes through.

## Fix

1. **`src/lib/auth.tsx`** — introduce a `rolesLoaded` flag and only flip `loading` to `false` once we know the user's roles (or there is no session).
   - Set `rolesLoaded = false` whenever we kick off `loadUserData`; set it to `true` in a `finally` inside `loadUserData`.
   - In the `onAuthStateChange` listener: if there is no session, set `loading=false` immediately; if there is a session, do **not** flip loading here — wait for `loadUserData` to finish.
   - In the `getSession().then(...)` initial path: await `loadUserData` (already does) before `setLoading(false)`. Keep the 6 s safety timer as-is.
   - This guarantees `isAdmin` reflects the real role the first time any consumer reads it.

2. **`src/components/app-shell.tsx` (or a tiny shared `<FullScreenLoader />`)** — replace the current `"Loading…"` text in `AuthGate` (`src/routes/__root.tsx`) with a centered spinner using the existing `Loader2` icon from `lucide-react` so the refresh moment feels intentional instead of blank.

3. **`src/lib/current-user.tsx`** — no behavioral change needed once roles load before `loading=false`, but add a short comment noting the invariant ("`isAdmin` is trustworthy here because `AuthGate` waits for `rolesLoaded`").

4. **`src/routes/calendar.tsx`** — keep the `role !== "admin"` redirect; with the fix it will only run after roles are known, so no more accidental bounce. No code change required, just verify after the auth fix.

## Out of scope

- No DB / RLS / migrations.
- No changes to notifications, shifts logic, or `useRequireAdmin` (it already gates on `loading`).
- No changes to the staff/shifts stores.

## Files touched

- `src/lib/auth.tsx` — add `rolesLoaded`, fix loading sequencing.
- `src/routes/__root.tsx` — swap the "Loading…" text for a spinner.
- `src/lib/current-user.tsx` — small clarifying comment only.
