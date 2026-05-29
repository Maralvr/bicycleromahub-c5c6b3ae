import type { Shift, Staff } from "./mock-data";

/**
 * Compute a staff member's real-time duty status from actual signals rather
 * than the static `staff.status` DB column (which defaults to "available" and
 * is never updated). Source of truth:
 *
 *  - "off"       → has an all-day unavailability entry for today, OR a partial
 *                  unavailability that covers the current time.
 *  - "on_shift"  → has an assigned, non-rejected shift today whose start/end
 *                  brackets the current time.
 *  - "available" → has at least one assigned, non-rejected shift today (so we
 *                  know they're actually working) but isn't on it right now.
 *  - null        → no signal — don't show a status pill.
 */
export function deriveStaffStatus(
  staffMember: Staff,
  shifts: Shift[],
  now: Date = new Date(),
): Staff["status"] | null {
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };

  const todayUnavail = staffMember.unavailability.find((u) => u.date === iso);
  if (todayUnavail) {
    if (todayUnavail.allDay) return "off";
    const from = todayUnavail.from ? toMin(todayUnavail.from) : 0;
    const to = todayUnavail.to ? toMin(todayUnavail.to) : 24 * 60;
    if (nowMin >= from && nowMin < to) return "off";
  }

  const todaysShifts = shifts.filter(
    (s) => s.assignedStaffId === staffMember.id && s.date === iso && s.status !== "rejected",
  );
  if (todaysShifts.length === 0) return null;

  const onNow = todaysShifts.some((s) => {
    const start = toMin(s.startTime);
    const end = toMin(s.endTime);
    return nowMin >= start && nowMin < end;
  });
  return onNow ? "on_shift" : "available";
}
