import type { RentalPoint } from "./rental-points";

/**
 * Match a booking to a rental point by its MEETING POINT string.
 *
 * Why this exists: `shifts.rental_point_id` means two things at once -- "this
 * booking belongs to a rental point" AND (via the `!rental_point_id` filter in
 * shifts-store.tsx) "hide this from the main admin/guide calendar". So guided
 * tours must NOT get `rental_point_id` set. Instead we derive an *additive*
 * association at render time from the meeting point, driven by the live
 * `rental_points` table (never a hardcoded map, so new points work
 * automatically).
 *
 * Matching is street-level, not house-number-level: e.g. Basilica San
 * Sebastiano (Via Appia Antica 136) and StarsBOX (Via Appia Antica 300) both
 * count as "at" the Appia Antica point (Via Appia Antica 175), which is the
 * intent -- rental staff want visibility of everything happening at their
 * location.
 */

/** lowercase, de-accent, drop punctuation/numbers, collapse whitespace. */
export function normalizePlace(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MIN_KEY_LENGTH = 5;

/** Generic tokens that must never be used as a match key on their own. */
const GENERIC = new Set([
  "roma",
  "rome",
  "italy",
  "italia",
  "via",
  "viale",
  "piazza",
  "largo",
  "corso",
  "bike",
  "point",
  "rental",
  "noleggio",
]);

export type RentalPointKeys = { pointId: string; keys: string[] };

/**
 * Build the substring keys for one rental point:
 *   - its name           ("appia antica", "lungotevere", "piazza venezia")
 *   - its street address without the house number ("via appia antica",
 *     "lungotevere delle armi", "via del gesu")
 * City is intentionally ignored -- "Rome" would match everything.
 */
export function buildRentalPointKeys(point: Pick<RentalPoint, "id" | "name" | "address">): RentalPointKeys {
  const raw = [point.name, point.address];
  const keys = raw
    .map(normalizePlace)
    .filter((k) => k.length >= MIN_KEY_LENGTH && !GENERIC.has(k))
    // "via appia antica" -> also usable as-is; dedupe below
    .filter((k, i, arr) => arr.indexOf(k) === i);
  return { pointId: point.id, keys };
}

export function buildRentalPointIndex(
  points: Pick<RentalPoint, "id" | "name" | "address">[],
): RentalPointKeys[] {
  registerRentalPointNames(points);
  return points.map(buildRentalPointKeys).filter((e) => e.keys.length > 0);
}


const UNKNOWN_MEETING_POINTS = new Set(["tbd", "tba", "n a", "na", "none", ""]);

/**
 * Resolve a meeting point to a rental point id.
 * Longest matching key wins. If two *different* points match with equal
 * strength the result is ambiguous -> null (safe default: show nowhere).
 */
export function matchRentalPointByMeetingPoint(
  meetingPoint: string | null | undefined,
  index: RentalPointKeys[],
): string | null {
  const hay = normalizePlace(meetingPoint);
  if (!hay || hay.length < 4 || UNKNOWN_MEETING_POINTS.has(hay)) return null;

  let bestId: string | null = null;
  let bestLen = 0;
  let ambiguous = false;

  for (const entry of index) {
    let localBest = 0;
    for (const key of entry.keys) {
      if (hay.includes(key) && key.length > localBest) localBest = key.length;
    }
    if (localBest === 0) continue;
    if (localBest > bestLen) {
      bestLen = localBest;
      bestId = entry.pointId;
      ambiguous = false;
    } else if (localBest === bestLen && entry.pointId !== bestId) {
      ambiguous = true;
    }
  }

  return ambiguous ? null : bestId;
}

/**
 * Tour-name rules that pin a booking to a rental point regardless of what its
 * meeting point string says (Bokun start points for these tours vary wildly:
 * shuttle pickups, pizzerias, catacomb entrances...). Matched against the
 * rental point's normalized NAME so it keeps working if the point is renamed
 * only in address/city.
 */
const TOUR_NAME_POINT_RULES: ReadonlyArray<{ tourPattern: string; pointNameKey: string }> = [
  { tourPattern: "appia antica", pointNameKey: "appia antica" },
];

function matchRentalPointByTourName(
  tourName: string | null | undefined,
  points: RentalPointKeys[],
  pointNames: Map<string, string>,
): string | null {
  const t = normalizePlace(tourName);
  if (!t) return null;
  for (const rule of TOUR_NAME_POINT_RULES) {
    if (!t.includes(rule.tourPattern)) continue;
    for (const entry of points) {
      if (pointNames.get(entry.pointId) === rule.pointNameKey) return entry.pointId;
    }
  }
  return null;
}

/** name-key lookup built alongside the index, so rules can target a point. */
let pointNameCache = new Map<string, string>();

export function registerRentalPointNames(
  points: Pick<RentalPoint, "id" | "name">[],
): void {
  pointNameCache = new Map(points.map((p) => [p.id, normalizePlace(p.name)]));
}

/**
 * The rental point a booking should appear under: the explicit
 * `rental_point_id` (bike rentals) OR, additively, a tour-name rule, OR a
 * meeting-point match (guided tours). Never mutates the shift.
 */
export function effectiveRentalPointId(
  shift: { rentalPointId: string | null; meetingPoint?: string | null; tourName?: string | null },
  index: RentalPointKeys[],
): string | null {
  return (
    shift.rentalPointId ??
    matchRentalPointByTourName(shift.tourName, index, pointNameCache) ??
    matchRentalPointByMeetingPoint(shift.meetingPoint, index)
  );
}


/** True when the booking only appears at the point via meeting-point matching. */
export function isTourAtPoint(shift: { rentalPointId: string | null }): boolean {
  return !shift.rentalPointId;
}

/** A meeting point that carries no location information at all. */
export function isUnknownMeetingPoint(meetingPoint: string | null | undefined): boolean {
  const n = normalizePlace(meetingPoint);
  return !n || n.length < 4 || UNKNOWN_MEETING_POINTS.has(n);
}
