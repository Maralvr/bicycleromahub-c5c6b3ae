import type { Shift } from "./mock-data";

/**
 * Bokun booking webhook payload (subset of fields we map).
 * Reference: https://bokun.dev/api-reference/booking/booking-webhooks
 */
export type BokunBookingPayload = {
  bookingId: string | number;
  confirmationCode?: string;
  productTitle: string;
  productId?: string | number;
  startDateTime: string; // ISO 8601
  endDateTime?: string; // ISO 8601
  durationMinutes?: number;
  pickupPlace?: { title?: string; address?: string };
  startPoint?: { title?: string; address?: string };
  customer: {
    firstName?: string;
    lastName?: string;
    fullName?: string;
    phoneNumber?: string;
    email?: string;
  };
  pricingCategoryBookings?: Array<{
    pricingCategory: { title: string };
    quantity: number;
  }>;
  extraBookings?: Array<{
    extra: { title: string };
    quantity: number;
  }>;
  totalPrice?: number;
  currency?: string;
  notes?: string;
  productTags?: string[];
};

const PRICING_CATEGORY_MAP: Record<string, "adults" | "teens" | "infants"> = {
  adult: "adults",
  adults: "adults",
  teen: "teens",
  teenager: "teens",
  teens: "teens",
  child: "teens",
  children: "teens",
  infant: "infants",
  infants: "infants",
  baby: "infants",
};

function inferRequiredTags(productTitle: string, productTags?: string[]): string[] {
  const tags = new Set<string>(productTags?.map((t) => t.toLowerCase()) ?? []);
  const title = productTitle.toLowerCase();

  // Always require e-bike for tour bookings
  tags.add("e-bike");

  if (title.includes("colosseum") || title.includes("forum")) tags.add("Colosseum tour");
  if (title.includes("vatican")) tags.add("Vatican tour");
  if (title.includes("appian")) tags.add("Appian Way");
  if (title.includes("night")) tags.add("night tour");
  if (title.includes("kid") || title.includes("family")) tags.add("kids tour");
  if (title.includes("private")) tags.add("private tour");

  return Array.from(tags);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function computeEndTime(start: string, end?: string, durationMinutes?: number): string {
  if (end) return formatTime(end);
  if (durationMinutes) {
    const d = new Date(new Date(start).getTime() + durationMinutes * 60_000);
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  }
  // default 3h tour
  const d = new Date(new Date(start).getTime() + 180 * 60_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * Map a Bokun booking webhook payload into our internal Shift record.
 * This is the function that would be called from /api/public/bokun-webhook
 * when the real backend integration is built.
 */
export function mapBokunBookingToShift(payload: BokunBookingPayload): Shift {
  const participants = { adults: 0, teens: 0, infants: 0, trailers: 0 };

  for (const pcb of payload.pricingCategoryBookings ?? []) {
    const key = PRICING_CATEGORY_MAP[pcb.pricingCategory.title.toLowerCase().trim()];
    if (key) participants[key] += pcb.quantity;
  }

  for (const extra of payload.extraBookings ?? []) {
    if (extra.extra.title.toLowerCase().includes("trailer")) {
      participants.trailers += extra.quantity;
    }
  }

  const meetingPoint =
    payload.pickupPlace?.title ||
    payload.pickupPlace?.address ||
    payload.startPoint?.title ||
    payload.startPoint?.address ||
    "TBD";

  const customerName =
    payload.customer.fullName ||
    [payload.customer.firstName, payload.customer.lastName].filter(Boolean).join(" ") ||
    "Unknown";

  return {
    id: `sh-bokun-${payload.bookingId}-${Date.now()}`,
    source: "bokun",
    bookingId: payload.confirmationCode || `BKN-${payload.bookingId}`,
    tourName: payload.productTitle,
    date: formatDate(payload.startDateTime),
    startTime: formatTime(payload.startDateTime),
    endTime: computeEndTime(payload.startDateTime, payload.endDateTime, payload.durationMinutes),
    meetingPoint,
    customer: {
      name: customerName,
      phone: payload.customer.phoneNumber || "—",
    },
    participants,
    rate: payload.totalPrice,
    notes: payload.notes,
    assignedStaffId: null,
    status: "unassigned",
    requiredTags: inferRequiredTags(payload.productTitle, payload.productTags),
  };
}

/**
 * Sample payloads simulating what Bokun would POST to our webhook.
 * Used by the "Simulate Bokun booking" button in the UI.
 */
export const sampleBokunPayloads: BokunBookingPayload[] = [
  {
    bookingId: 99001,
    confirmationCode: "BKN-99001",
    productTitle: "Colosseum & Roman Forum E-Bike Tour",
    startDateTime: new Date(Date.now() + 2 * 86400000).toISOString().replace(/T.*/, "T10:00:00.000Z"),
    durationMinutes: 180,
    pickupPlace: { title: "Piazza Venezia, Rome" },
    customer: {
      firstName: "Olivia",
      lastName: "Bennett",
      phoneNumber: "+1 415 555 0188",
      email: "olivia.b@example.com",
    },
    pricingCategoryBookings: [
      { pricingCategory: { title: "Adult" }, quantity: 4 },
      { pricingCategory: { title: "Teen" }, quantity: 2 },
    ],
    extraBookings: [{ extra: { title: "Child trailer" }, quantity: 1 }],
    totalPrice: 360,
    currency: "EUR",
    notes: "One guest with knee injury — easy pace please",
  },
  {
    bookingId: 99002,
    confirmationCode: "BKN-99002",
    productTitle: "Vatican Highlights E-Bike Tour",
    startDateTime: new Date(Date.now() + 86400000).toISOString().replace(/T.*/, "T15:00:00.000Z"),
    durationMinutes: 180,
    startPoint: { title: "Castel Sant'Angelo" },
    customer: {
      fullName: "Jean-Luc Moreau",
      phoneNumber: "+33 6 55 44 33 22",
    },
    pricingCategoryBookings: [
      { pricingCategory: { title: "Adult" }, quantity: 2 },
      { pricingCategory: { title: "Infant" }, quantity: 1 },
    ],
    totalPrice: 180,
    currency: "EUR",
  },
  {
    bookingId: 99003,
    confirmationCode: "BKN-99003",
    productTitle: "Private Night Rome E-Bike Tour",
    startDateTime: new Date(Date.now() + 3 * 86400000).toISOString().replace(/T.*/, "T20:30:00.000Z"),
    durationMinutes: 150,
    pickupPlace: { title: "Piazza del Popolo" },
    customer: {
      firstName: "Liam",
      lastName: "O'Connor",
      phoneNumber: "+353 87 123 4567",
    },
    pricingCategoryBookings: [{ pricingCategory: { title: "Adult" }, quantity: 6 }],
    totalPrice: 540,
    currency: "EUR",
    notes: "Bachelor party — group photo at Trevi please",
    productTags: ["private tour"],
  },
];
