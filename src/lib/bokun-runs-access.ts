/**
 * The Bokun Runs diagnostics page (sync history, manual trigger, raw run
 * logs/errors) is scoped to a single account rather than every admin -- it
 * exposes internal sync mechanics that aren't relevant to most admin users.
 * Kept as one shared constant so the client-side guard/nav-hiding
 * (require-admin.ts, app-shell.tsx) and the server-side check
 * (bokun-import.server.ts's assertAdmin) can't drift apart. The database-side
 * RLS policy on bokun_import_runs hardcodes the same email directly in SQL
 * (see the migration that added it) since SQL can't import this file --
 * keep both in sync if this ever changes.
 */
export const BOKUN_RUNS_ALLOWED_EMAIL = "marallvalipour@gmail.com";
