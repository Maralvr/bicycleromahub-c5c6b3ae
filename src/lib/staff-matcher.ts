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
 * the shift's date/time window. Returns the conflict description, or null.
 */
function findUnavailabilityConflict(staff: Staff, shift: Shift): string | null {
  const start = toMinutes(shift.startTime);
  const end = toMinutes(shift.endTime);
  for (const u of staff.unavailability) {
    if (u.date !== shift.date) continue;
    if (u.allDay) return `Unavailable all day${u.reason ? ` (${u.reason})` : ""}`;
    if (u.from && u.to) {
      const uStart = toMinutes(u.from);
      const uEnd = toMinutes(u.to);
      if (start < uEnd && end > uStart) {
        return `Busy ${u.from}–${u.to}`;
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

  // --- 1. Tag matching (most important) ---
  const matchedTags = shift.requiredTags.filter((tag) => staff.tags.includes(tag));
  const tagMatchRatio = shift.requiredTags.length > 0 ? matchedTags.length / shift.requiredTags.length : 0;

  // Hard requirement: must match at least one required tag
  if (matchedTags.length === 0 && shift.requiredTags.length > 0) return null;

  score += matchedTags.length * 25;
  if (tagMatchRatio === 1) {
    score += 15;
    reasons.push(`All ${matchedTags.length} required skills match`);
  } else if (matchedTags.length > 0) {
    reasons.push(`${matchedTags.length}/${shift.requiredTags.length} skills match`);
  }

  // --- 2. Role fit ---
  const isRentalShift = shift.requiredTags.some((t) => t.toLowerCase().includes("rental"));
  const isMaintenanceShift = shift.requiredTags.some((t) => t.toLowerCase().includes("maintenance"));
  if (isRentalShift && staff.role !== "rental") return null;
  if (isMaintenanceShift && staff.role !== "mechanic") return null;
  if (!isRentalShift && !isMaintenanceShift && staff.role === "guide") {
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

  // --- 7. Workload balancing — slight penalty for already-busy staff today ---
  const shiftsToday = allShifts.filter(
    (s) => s.assignedStaffId === staff.id && s.date === shift.date && s.status !== "rejected" && s.id !== shift.id,
  ).length;
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
