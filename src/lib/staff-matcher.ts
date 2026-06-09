import type { Shift, Staff } from "./mock-data";

export type StaffSuggestion = {
  staff: Staff;
  score: number;
  reasons: string[];
  warnings: string[];
};

/**
 * Detect required language hints from a shift's tour name, customer name,
 * or notes. Returns ISO-like language codes that match staff.languages.
 */
function detectLanguageHints(shift: Shift): string[] {
  const blob = [shift.tourName, shift.notes, shift.customer?.name, shift.customer?.phone]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hints = new Set<string>();
  // Always assume English as a baseline for tourist tours
  hints.add("EN");

  if (/\b(spanish|español|spagnol)/i.test(blob) || /^\+34\b/.test(shift.customer?.phone ?? "")) hints.add("ES");
  if (/\b(french|français|france)/i.test(blob) || /^\+33\b/.test(shift.customer?.phone ?? "")) hints.add("FR");
  if (/\b(german|deutsch|germany)/i.test(blob) || /^\+49\b/.test(shift.customer?.phone ?? "")) hints.add("DE");
  if (/\b(japanese|japan|nihongo)/i.test(blob) || /^\+81\b/.test(shift.customer?.phone ?? "")) hints.add("JP");
  if (/\b(italian|italiano)/i.test(blob) || /^\+39\b/.test(shift.customer?.phone ?? "")) hints.add("IT");

  return Array.from(hints);
}

/** Detect license requirements from the shift's required tags / nature. */
function detectRequiredLicenses(shift: Shift): string[] {
  const required: string[] = [];
  if (shift.requiredTags.some((t) => t.toLowerCase().includes("private"))) required.push("Tour guide");
  if (shift.requiredTags.some((t) => t.includes("e-bike") || t.includes("tour"))) required.push("First aid");
  return required;
}

/** Convert "HH:MM" → minutes since midnight. */
function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Check whether the staff member has any unavailability that overlaps with
 * the shift's date/time window. Returns:
 *  - { hard: true, reason } when the guide marked the whole day off (hard block)
 *  - { hard: false, reason } when there's only a partial-time conflict (soft warn)
 *  - null when no conflict
 */
function findUnavailabilityConflict(
  staff: Staff,
  shift: Shift,
): { hard: boolean; reason: string } | null {
  const start = toMinutes(shift.startTime);
  const end = toMinutes(shift.endTime);
  for (const u of staff.unavailability) {
    if (u.date !== shift.date) continue;
    if (u.allDay) return { hard: true, reason: `Unavailable all day${u.reason ? ` (${u.reason})` : ""}` };
    if (u.from && u.to) {
      const uStart = toMinutes(u.from);
      const uEnd = toMinutes(u.to);
      if (start < uEnd && end > uStart) {
        return { hard: false, reason: `Busy ${u.from}–${u.to}` };
      }
    }
  }
  return null;
}

/**
 * Score a single staff member against a shift. Higher score = better match.
 * Returns null if the staff member is hard-disqualified.
 */
function scoreStaff(staff: Staff, shift: Shift, allShifts: Shift[]): StaffSuggestion | null {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  // --- 1. Tag matching (soft — boosts score, never disqualifies) ---
  const matchedTags = shift.requiredTags.filter((tag) => staff.tags.includes(tag));
  const tagMatchRatio = shift.requiredTags.length > 0 ? matchedTags.length / shift.requiredTags.length : 0;

  score += matchedTags.length * 25;
  if (shift.requiredTags.length > 0 && tagMatchRatio === 1) {
    score += 15;
    reasons.push(`All ${matchedTags.length} required skills match`);
  } else if (matchedTags.length > 0) {
    reasons.push(`${matchedTags.length}/${shift.requiredTags.length} skills match`);
  } else if (shift.requiredTags.length > 0) {
    warnings.push(`Missing skill: ${shift.requiredTags.join(", ")}`);
  }

  // --- 2. Role fit (soft) ---
  if (staff.role === "guide") {
    score += 10;
    reasons.push("Guide role");
  }

  // --- 3. Availability / unavailability check ---
  const conflict = findUnavailabilityConflict(staff, shift);
  if (conflict) return null; // hard block

  // Check for overlapping shifts already assigned
  const overlapping = allShifts.find((other) => {
    if (other.id === shift.id) return false;
    if (other.assignedStaffId !== staff.id) return false;
    if (other.date !== shift.date) return false;
    if (other.status === "rejected") return false;
    const oStart = toMinutes(other.startTime);
    const oEnd = toMinutes(other.endTime);
    return toMinutes(shift.startTime) < oEnd && toMinutes(shift.endTime) > oStart;
  });
  if (overlapping) return null; // hard block — double booking

  // --- 4. Status preference ---
  if (staff.status === "available") {
    score += 20;
    reasons.push("Currently available");
  } else if (staff.status === "on_shift") {
    score += 5;
    warnings.push("Already on a shift today");
  } else if (staff.status === "off") {
    score += 0;
    warnings.push("Off duty");
  }

  // --- 5. Language fit ---
  const languageHints = detectLanguageHints(shift);
  const matchedLanguages = languageHints.filter((l) => staff.languages.includes(l));
  if (matchedLanguages.length > 0) {
    score += matchedLanguages.length * 8;
    if (matchedLanguages.some((l) => l !== "EN")) {
      reasons.push(`Speaks ${matchedLanguages.filter((l) => l !== "EN").join(", ")}`);
    }
  }
  const missingNonEnglish = languageHints.filter((l) => l !== "EN" && !staff.languages.includes(l));
  if (missingNonEnglish.length > 0) {
    warnings.push(`Doesn't speak ${missingNonEnglish.join(", ")}`);
  }

  // --- 6. License fit ---
  const requiredLicenses = detectRequiredLicenses(shift);
  const matchedLicenses = requiredLicenses.filter((l) => staff.licenses.includes(l));
  score += matchedLicenses.length * 6;
  if (matchedLicenses.length > 0) {
    reasons.push(`Has ${matchedLicenses.join(", ")}`);
  }
  const missingLicenses = requiredLicenses.filter((l) => !staff.licenses.includes(l));
  if (missingLicenses.length > 0) {
    warnings.push(`Missing ${missingLicenses.join(", ")}`);
  }

  // --- 7. Workload balancing — penalize busy guides this week, reward lighter loads ---
  const shiftDate = new Date(shift.date);
  const weekStart = new Date(shiftDate);
  weekStart.setDate(shiftDate.getDate() - shiftDate.getDay()); // Sunday
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const weekStartStr = ymd(weekStart);
  const weekEndStr = ymd(weekEnd);

  const shiftsThisWeek = allShifts.filter(
    (s) =>
      s.assignedStaffId === staff.id &&
      s.id !== shift.id &&
      s.status !== "rejected" &&
      s.date >= weekStartStr &&
      s.date <= weekEndStr,
  ).length;

  const shiftsToday = allShifts.filter(
    (s) => s.assignedStaffId === staff.id && s.date === shift.date && s.status !== "rejected" && s.id !== shift.id,
  ).length;

  // Light load bonus, heavy load penalty
  if (shiftsThisWeek === 0) {
    score += 12;
    reasons.push("No shifts this week — fresh load");
  } else if (shiftsThisWeek <= 2) {
    score += 6;
    reasons.push(`Light week (${shiftsThisWeek} shifts)`);
  } else if (shiftsThisWeek >= 5) {
    score -= shiftsThisWeek * 3;
    warnings.push(`Heavy week (${shiftsThisWeek} shifts)`);
  }

  if (shiftsToday > 0) {
    score -= shiftsToday * 4;
    if (shiftsToday >= 2) warnings.push(`${shiftsToday} shifts already today`);
  }

  return { staff, score, reasons, warnings };
}

/**
 * Suggest the top N best-fit staff members for a shift.
 * Returns suggestions sorted by score (best first). Hard-disqualified staff
 * (wrong role, missing required tags, time conflicts) are excluded entirely.
 */
export function suggestStaffForShift(
  shift: Shift,
  allStaff: Staff[],
  allShifts: Shift[],
  limit = 3,
): StaffSuggestion[] {
  return allStaff
    .map((s) => scoreStaff(s, shift, allShifts))
    .filter((s): s is StaffSuggestion => s !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export type StaffCandidate = {
  staff: Staff;
  eligible: boolean;
  score: number;
  reasons: string[];
  warnings: string[];
  disqualifiedReason?: string;
};

/**
 * Same as suggestStaffForShift but returns ALL staff, including disqualified
 * ones with the human-readable reason they can't take this shift. Used by the
 * admin "Smart assignment" dialog to show full transparency.
 */
export function rankAllCandidates(shift: Shift, allStaff: Staff[], allShifts: Shift[]): StaffCandidate[] {
  return allStaff
    .map<StaffCandidate>((s) => {
      const scored = scoreStaff(s, shift, allShifts);
      if (scored) {
        return { staff: s, eligible: true, score: scored.score, reasons: scored.reasons, warnings: scored.warnings };
      }
      // Only availability-based hard blocks remain
      let reason = "Unavailable";
      const conflict = findUnavailabilityConflict(s, shift);
      if (conflict) reason = conflict;
      else {
        const overlap = allShifts.find(
          (o) =>
            o.id !== shift.id &&
            o.assignedStaffId === s.id &&
            o.date === shift.date &&
            o.status !== "rejected" &&
            toMinutes(shift.startTime) < toMinutes(o.endTime) &&
            toMinutes(shift.endTime) > toMinutes(o.startTime),
        );
        if (overlap) reason = `Double-booked at ${overlap.startTime}`;
      }
      return { staff: s, eligible: false, score: 0, reasons: [], warnings: [], disqualifiedReason: reason };
    })
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return b.score - a.score;
    });
}
