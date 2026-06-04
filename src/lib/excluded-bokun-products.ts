/**
 * Bokun products to hide from the shifts/calendar views and skip on import.
 * These represent partner/B2B products that should not appear in operational schedules.
 *
 * - Bokun product IDs are matched against `activity.product.id` in the import payload.
 * - Tour-name patterns (case-insensitive substring) filter existing rows in the UI,
 *   since the product ID is not persisted on the shifts table.
 */

export const EXCLUDED_BOKUN_PRODUCT_IDS: ReadonlySet<string> = new Set([
  "1211762", // Le Meridien Visconti
  "947405",  // Livitaly
  "969818",  // Roma 'n Bike card
]);

export const EXCLUDED_TOUR_NAME_PATTERNS: ReadonlyArray<string> = [
  "meridien",
  "visconti",
  "livitaly",
  "livital",
  "roma 'n bike",
  "roma'n bike",
  "roma n bike",
];

export function isExcludedTourName(tourName: string | null | undefined): boolean {
  if (!tourName) return false;
  const t = tourName.toLowerCase();
  return EXCLUDED_TOUR_NAME_PATTERNS.some((p) => t.includes(p));
}

export function isExcludedBokunProductId(id: string | number | null | undefined): boolean {
  if (id == null) return false;
  return EXCLUDED_BOKUN_PRODUCT_IDS.has(String(id));
}
