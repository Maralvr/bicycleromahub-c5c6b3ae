// Canonical list of rate-title (language) options for PUBLIC tours.
// Using a fixed list ensures bookings group together on the calendar
// when admins change the language — free text typos would break grouping.

export const PUBLIC_TOUR_LANGUAGES = [
  "Public tour in English",
  "Public tour in Italian",
  "Public tour in Spanish",
  "Public tour in French",
] as const;

export type PublicTourLanguage = (typeof PUBLIC_TOUR_LANGUAGES)[number];

/**
 * A shift is treated as a "public tour" (and thus eligible for the language
 * dropdown / grouping) when it isn't explicitly a private rate.
 * Mirrors the rule used by `groupDepartures` in shifts-calendar.tsx.
 */
export function isPublicTour(rateTitle: string | null | undefined): boolean {
  const v = (rateTitle ?? "").trim();
  if (!v) return true;
  return !/private/i.test(v);
}
