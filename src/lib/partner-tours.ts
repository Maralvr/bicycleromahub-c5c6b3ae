/**
 * Partner-operated Bokun products (Livitaly, Le Meridien Visconti,
 * Roma 'n Bike Card).
 *
 * These used to be excluded from import + hidden from every view. They are now
 * imported and displayed like any other booking — this registry only drives a
 * "Partner" visual tag (and could gate guide assignment) rather than exclusion.
 *
 * - Product IDs match `activity.product.id` in the Bokun import payload.
 * - Tour-name patterns (case-insensitive substring) tag existing rows in the UI,
 *   since the product ID is not reliably persisted on the shifts table.
 */

export const PARTNER_BOKUN_PRODUCT_IDS: ReadonlySet<string> = new Set([
  "1211762", // Le Meridien Visconti
  "947405", // Appia Antica by Livitaly
  "969818", // Roma 'n Bike Card
]);

export const PARTNER_TOUR_NAME_PATTERNS: ReadonlyArray<string> = [
  "meridien",
  "visconti",
  "livitaly",
  "livital",
  "roma 'n bike",
  "roma'n bike",
  "roma n bike",
];

/** True when a shift's tour name belongs to a partner-operated product. */
export function isPartnerTour(tourName: string | null | undefined): boolean {
  if (!tourName) return false;
  const t = tourName.toLowerCase();
  return PARTNER_TOUR_NAME_PATTERNS.some((p) => t.includes(p));
}

export function isPartnerBokunProductId(id: string | number | null | undefined): boolean {
  if (id == null) return false;
  return PARTNER_BOKUN_PRODUCT_IDS.has(String(id));
}
