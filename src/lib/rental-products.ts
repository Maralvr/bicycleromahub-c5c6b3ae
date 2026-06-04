/**
 * Bokun product IDs that represent BIKE RENTALS (not guided tours).
 * Bookings for these products are routed to a specific rental point and
 * hidden from the regular shifts / calendar views.
 *
 * Maps Bokun product ID → rental point name (case-insensitive match
 * against `rental_points.name`).
 */

export const RENTAL_PRODUCT_TO_LOCATION: Record<string, string> = {
  // Appia Antica
  "692119": "Appia Antica",
  "244760": "Appia Antica",
  "969081": "Appia Antica",
  "969329": "Appia Antica",
  // Lungotevere
  "692101": "Lungotevere",
  "969398": "Lungotevere",
  "244761": "Lungotevere",
  // Piazza Venezia
  "692129": "Piazza Venezia",
};

export function rentalLocationForProductId(
  id: string | number | null | undefined,
): string | null {
  if (id == null) return null;
  return RENTAL_PRODUCT_TO_LOCATION[String(id)] ?? null;
}

export function isRentalProductId(id: string | number | null | undefined): boolean {
  return rentalLocationForProductId(id) !== null;
}
