import type { Shift } from "./mock-data";

/**
 * Client-side mirror of the database guard `public.guide_conflicting_shift`.
 *
 * The database trigger (`shifts_block_guide_conflict_trg` /
 * `sag_block_guide_conflict_trg`) is the real backstop — this helper exists so
 * the UI can grey out already-busy guides before an admin attempts a doomed
 * assignment. Keep the two in sync.
 *
 * Rules:
 *  - Same date, and time ranges that genuinely overlap: start1 < end2 && start2 < end1.
 *    Back-to-back shifts (10:00–12:00 then 12:00–14:00) are NOT a conflict.
 *  - Same-departure exemption: one Bokun departure produces one `shifts` row per
 *    booking, and a guide legitimately leads all of them. Rows with identical
 *    date + start + end + tour name are treated as the same departure.
 *  - Only live commitments count: pending or accepted. Unassigned / rejected
 *    assignments don't hold a guide's time.
 */

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

const LIVE_STATUSES = new Set(["pending", "accepted"]);

export function isSameDeparture(a: Shift, b: Shift): boolean {
  return (
    a.date === b.date &&
    a.startTime === b.startTime &&
    a.endTime === b.endTime &&
    a.tourName === b.tourName
  );
}

/**
 * Find the shift that would clash if `staffId` were assigned to `shift`,
 * or null when the guide is free.
 */
export function findGuideConflict(
  staffId: string,
  shift: Shift,
  allShifts: Shift[],
): Shift | null {
  const start = toMinutes(shift.startTime);
  const end = toMinutes(shift.endTime);
  for (const other of allShifts) {
    if (other.id === shift.id) continue;
    if (other.assignedStaffId !== staffId) continue;
    if (other.date !== shift.date) continue;
    if (!LIVE_STATUSES.has(other.status)) continue;
    const oStart = toMinutes(other.startTime);
    const oEnd = toMinutes(other.endTime);
    if (!(start < oEnd && oStart < end)) continue;
    if (isSameDeparture(shift, other)) continue;
    return other;
  }
  return null;
}

/** Human-readable label for a conflict, used in dropdowns and toasts. */
export function conflictLabel(other: Shift): string {
  return `Busy ${other.startTime}–${other.endTime} · ${other.tourName}`;
}

/** Ids of guides who are already committed to an overlapping shift. */
export function busyStaffIds(
  shift: Shift,
  staffIds: string[],
  allShifts: Shift[],
): Map<string, Shift> {
  const out = new Map<string, Shift>();
  for (const id of staffIds) {
    const c = findGuideConflict(id, shift, allShifts);
    if (c) out.set(id, c);
  }
  return out;
}

/**
 * Maps the database trigger's error into a readable message.
 * The trigger raises with SQLSTATE 23P01 (exclusion_violation).
 */
export function guideConflictMessage(error: unknown): string | null {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return null;
  if (e.code === "23P01" || /already booked on/i.test(e.message ?? "")) {
    return e.message ?? "This guide is already booked on an overlapping tour.";
  }
  return null;
}
