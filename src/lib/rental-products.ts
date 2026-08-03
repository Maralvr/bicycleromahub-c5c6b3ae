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

/**
 * Some Bokun payloads (notably webhook pushes and partner-channel bookings)
 * arrive without a product id, so `rentalLocationForProductId` can't tag them
 * and the booking never shows up under "Rental bookings". Fall back to the
 * product title for those.
 */
const RENTAL_TITLE_TO_LOCATION: Record<string, string> = {
  // Appia Antica
  "electric bike rental at appia antica": "Appia Antica",
  "regular bikes at appia antica": "Appia Antica",
  "appian way bike rental: from 2h to 6h": "Appia Antica",
  "noleggio bici via appia: dalle 2h alle 6h": "Appia Antica",
  "appia antica bike point": "Appia Antica",
  "punto noleggio bici appia antica": "Appia Antica",
  "noleggio biciclette elettriche sull'appia antica": "Appia Antica",
  "noleggio biciclette tradizionali sull'appia antica": "Appia Antica",
  // Lungotevere
  "electric bike rental at lungotevere": "Lungotevere",
  "regular bikes at lungotevere": "Lungotevere",
  "noleggio biciclette elettriche sul lungotevere": "Lungotevere",
  "noleggio biciclette tradizionali sul lungotevere": "Lungotevere",
  "rome electric & muscle rental bike: from 2 to 8-hour": "Lungotevere",
  // Piazza Venezia
  "electric bikes at piazza venezia": "Piazza Venezia",
  "regular bikes at piazza venezia": "Piazza Venezia",
};

const RENTAL_KEYWORDS = /(rental|noleggio|bike point|punto noleggio|bikes at)/i;
const LOCATION_KEYWORDS: Array<[RegExp, string]> = [
  [/appia antica|appian way|via appia/i, "Appia Antica"],
  [/lungotevere/i, "Lungotevere"],
  [/piazza venezia/i, "Piazza Venezia"],
];

export function rentalLocationForTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  const key = title.trim().toLowerCase();
  const exact = RENTAL_TITLE_TO_LOCATION[key];
  if (exact) return exact;
  // Generic: only treat as a rental when the title actually says so, so guided
  // tours that merely mention a location are never mis-tagged.
  if (!RENTAL_KEYWORDS.test(key)) return null;
  for (const [re, location] of LOCATION_KEYWORDS) if (re.test(key)) return location;
  return null;
}

/** Product id first, product title as fallback. */
export function rentalLocationForBooking(
  id: string | number | null | undefined,
  title: string | null | undefined,
): string | null {
  return rentalLocationForProductId(id) ?? rentalLocationForTitle(title);
}
