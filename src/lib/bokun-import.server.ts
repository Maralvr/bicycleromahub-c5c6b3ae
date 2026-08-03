import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isExcludedBokunProductId, isExcludedTourName } from "./excluded-bokun-products";
import { rentalLocationForBooking } from "./rental-products";
import { cleanNoteText } from "./notes-format";

const PRICING_MAP: Record<string, "adults" | "teens" | "infants"> = {
  adult: "adults", adults: "adults", person: "adults", people: "adults", participant: "adults", participants: "adults", pax: "adults",
  teen: "teens", teenager: "teens", teens: "teens", child: "teens", children: "teens",
  infant: "infants", infants: "infants", baby: "infants",
};

// In-memory cache of rental point name → id map.
// Rental points change very rarely, but the Bokun sync re-fetches this list
// for every chunk (many times per run). A short TTL keeps the data fresh
// while collapsing thousands of identical SELECTs into one.
const RENTAL_POINT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let rentalPointCache: { map: Map<string, string>; expiresAt: number } | null = null;

async function getRentalPointNameMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (rentalPointCache && rentalPointCache.expiresAt > now) {
    return rentalPointCache.map;
  }
  const { data: rpRows } = await supabaseAdmin
    .from("rental_points")
    .select("id, name");
  const map = new Map<string, string>(
    (rpRows ?? []).map((r) => [r.name.toLowerCase(), r.id]),
  );
  rentalPointCache = { map, expiresAt: now + RENTAL_POINT_CACHE_TTL_MS };
  return map;
}

type BokunDateValue = string | number;
type BokunAddress = {
  addressLine1?: string;
  addressLine2?: string | null;
  city?: string;
  postalCode?: string;
  countryCode?: string;
};

function pricingCategoryKey(title: string) {
  const normalized = title.toLowerCase().trim();
  if (normalized.includes("infant") || normalized.includes("baby")) return "infants";
  if (normalized.includes("teen") || normalized.includes("child") || normalized.includes("kid")) return "teens";
  return PRICING_MAP[normalized] ?? "adults";
}

function inferTags(title: string, productTags?: string[]) {
  const tags = new Set<string>(productTags?.map((t) => t.toLowerCase()) ?? []);
  const t = (title ?? "").toLowerCase();
  tags.add("e-bike");
  if (t.includes("colosseum") || t.includes("forum")) tags.add("Colosseum tour");
  if (t.includes("vatican")) tags.add("Vatican tour");
  if (t.includes("appian")) tags.add("Appian Way");
  if (t.includes("night")) tags.add("night tour");
  if (t.includes("kid") || t.includes("family")) tags.add("kids tour");
  if (t.includes("private")) tags.add("private tour");
  return Array.from(tags);
}

function fmtTime(value: BokunDateValue) {
  const d = new Date(value);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:00`;
}

function dateOnly(value: BokunDateValue) {
  return new Date(value).toISOString().slice(0, 10);
}

function textValue(value: unknown) {
  // Bokun sometimes hands us the notes field as an already-serialized JSON
  // string (an array of {author, body, type, ...} note objects) instead of
  // a real array in the parsed payload. Without this, that raw JSON text
  // gets stored verbatim in shifts.notes and shown as-is everywhere a
  // shift's notes render (see notes-format.ts for the full story).
  if (typeof value === "string") return cleanNoteText(value);
  if (Array.isArray(value)) {
    const notes = value
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return null;
        const body = (item as { body?: unknown }).body;
        return typeof body === "string" ? body : null;
      })
      .filter(Boolean);
    return notes.length ? notes.join("\n\n") : null;
  }
  if (!value || typeof value !== "object") return null;
  const entries = Object.entries(value).filter(([, v]) => typeof v === "string" && v);
  return entries.length ? entries.map(([k, v]) => `${k}: ${v}`).join("\n") : null;
}

function addressText(address?: string | BokunAddress | null) {
  if (!address) return null;
  if (typeof address === "string") return address;
  return [address.addressLine1, address.addressLine2, address.city, address.postalCode, address.countryCode]
    .filter(Boolean)
    .join(", ") || null;
}

function placeText(place?: { title?: string; address?: string | BokunAddress } | null) {
  if (!place) return null;
  const address = addressText(place.address);
  return [place.title, address].filter(Boolean).join(" — ") || null;
}

function moneyAmount(value?: number | { amount?: number } | null) {
  if (typeof value === "number") return value;
  return value?.amount ?? null;
}

function hasCustomer(customer: BokunBookingFull["customer"] | undefined) {
  return Boolean(customer?.fullName || customer?.firstName || customer?.lastName || customer?.email || customer?.phoneNumber);
}

function computeEnd(start: BokunDateValue, end?: BokunDateValue, durationMinutes?: number) {
  if (end) return fmtTime(end);
  const mins = durationMinutes ?? 180;
  const d = new Date(new Date(start).getTime() + mins * 60_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:00`;
}

async function bokunSign(method: string, path: string, accessKey: string, secretKey: string) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
  const stringToSign = `${date}${accessKey}${method}${path}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secretKey),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(stringToSign));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
  return { date, signature };
}

export async function bokunFetch(method: "GET" | "POST", path: string, body?: unknown) {
  const accessKey = process.env.BOKUN_ACCESS_KEY;
  const secretKey = process.env.BOKUN_SECRET_KEY;
  if (!accessKey || !secretKey) throw new Error("Missing BOKUN_ACCESS_KEY / BOKUN_SECRET_KEY");

  const { date, signature } = await bokunSign(method, path, accessKey, secretKey);
  const res = await fetch(`https://api.bokun.io${path}`, {
    method,
    headers: {
      "X-Bokun-Date": date,
      "X-Bokun-AccessKey": accessKey,
      "X-Bokun-Signature": signature,
      "Content-Type": "application/json;charset=UTF-8",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bokun ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

type BokunPassenger = { firstName?: string; lastName?: string; fullName?: string };
type BokunPricingCategoryBooking = {
  pricingCategory?: { title?: string; fullTitle?: string };
  quantity?: number;
  leadPassenger?: BokunPassenger | boolean;
  passengers?: BokunPassenger[];
};
type BokunExtraBooking = { extra?: { title?: string }; title?: string; quantity?: number };

interface BokunBookingFull {
  id?: number | string;
  bookingId?: number | string;
  confirmationCode?: string;
  productConfirmationCode?: string;
  parentBookingId?: number | string;
  externalBookingReference?: string;
  productTitle?: string;
  product?: { title?: string; tags?: string[]; id?: number | string };
  title?: string;
  startDateTime?: BokunDateValue;
  startDate?: BokunDateValue;
  endDateTime?: BokunDateValue;
  durationMinutes?: number;
  pickupPlace?: { title?: string; address?: string | BokunAddress };
  startPoint?: { title?: string; address?: string | BokunAddress };
  customer?: {
    firstName?: string;
    lastName?: string;
    fullName?: string;
    phoneNumber?: string;
    email?: string;
    notes?: string;
  };
  pricingCategoryBookings?: BokunPricingCategoryBooking[];
  extraBookings?: BokunExtraBooking[];
  totalParticipants?: number;
  totalPrice?: number | { amount?: number; currency?: string };
  totalPriceAmount?: number;
  totalPaid?: number | { amount?: number; currency?: string };
  paidAmountAsMoney?: { amount?: number; currency?: string };
  paymentStatus?: string;
  paidType?: string;
  totalAsMoney?: { amount?: number; currency?: string };
  currency?: string;
  notes?: string;
  internalNotes?: string;
  productTags?: string[];
  status?: string;
  creationDate?: BokunDateValue;
  createdDate?: BokunDateValue;
  ticketSent?: boolean;
  seller?: { title?: string; companyName?: string };
  sellerName?: string;
  bookingChannel?: { title?: string; systemType?: string };
  channel?: { title?: string; systemType?: string };
  rateTitle?: string;
  rate?: { title?: string };
  invoice?: {
    product?: { rateTitle?: string };
    productInvoices?: Array<{ product?: { rateTitle?: string } }>;
  };


  fields?: {
    priceCategoryBookings?: BokunPricingCategoryBooking[];
    bookedExtras?: BokunExtraBooking[];
    totalParticipants?: number;
  };
  productBookings?: BokunBookingFull[];
  activityBookings?: Array<{
    bookingId?: number | string;
    parentBookingId?: number | string;
    confirmationCode?: string;
    productConfirmationCode?: string;
    activity?: { title?: string; durationMinutes?: number; durationHours?: number; startPoints?: Array<{ title?: string; address?: string | BokunAddress }>; defaultRateId?: number | string; rates?: Array<{ id?: number | string; title?: string; rateCode?: string }> };
    product?: { title?: string; tags?: string[]; id?: number | string };
    title?: string;
    startDateTime?: BokunDateValue;
    endDateTime?: BokunDateValue;
    pickupPlace?: { title?: string; address?: string | BokunAddress };
    startPoint?: { title?: string; address?: string | BokunAddress };
    pickup?: false | { title?: string; address?: string | BokunAddress };
    rateTitle?: string;
    rateId?: number | string;
    rate?: { title?: string };
    invoice?: { product?: { rateTitle?: string } };

    pricingCategoryBookings?: BokunPricingCategoryBooking[];
    extraBookings?: BokunExtraBooking[];
    extras?: BokunExtraBooking[];
    totalParticipants?: number;
    totalPrice?: number | { amount?: number; currency?: string };
    totalPriceAmount?: number;
    paidType?: string;
    seller?: { title?: string; companyName?: string };
    notes?: unknown;
  }>;
}

function mapToShiftRow(raw: BokunBookingFull, rentalPointIdByName: Map<string, string> = new Map()) {
  const a0 = raw.activityBookings?.[0];
  const detailActivity = raw.activityBookings?.find((a) => String(a.bookingId ?? a.productConfirmationCode ?? "") === String(raw.id ?? raw.bookingId ?? raw.productConfirmationCode ?? "")) ?? a0;
  const activity = detailActivity ?? a0;
  const productTitle = activity?.product?.title ?? activity?.activity?.title ?? activity?.title ?? raw.product?.title ?? raw.productTitle ?? raw.title ?? "Bokun booking";
  const productId = activity?.product?.id ?? raw.product?.id;
  if (isExcludedBokunProductId(productId) || isExcludedTourName(productTitle)) return null;
  const rentalLocation = rentalLocationForBooking(productId, productTitle);
  const rentalPointId = rentalLocation ? rentalPointIdByName.get(rentalLocation.toLowerCase()) ?? null : null;
  const startDateTime = activity?.startDateTime ?? raw.startDateTime ?? raw.startDate ?? a0?.startDateTime;
  if (!startDateTime) return null;
  const endDateTime = activity?.endDateTime ?? raw.endDateTime ?? a0?.endDateTime;
  const durationMinutes = raw.durationMinutes ?? activity?.activity?.durationMinutes ?? (activity?.activity?.durationHours ? activity.activity.durationHours * 60 : undefined) ?? a0?.activity?.durationMinutes;
  const pickup = activity?.pickup && typeof activity.pickup === "object" ? activity.pickup : null;
  const meeting = placeText(raw.pickupPlace) ?? placeText(activity?.pickupPlace) ?? placeText(pickup) ?? placeText(raw.startPoint) ?? placeText(activity?.startPoint) ?? placeText(activity?.activity?.startPoints?.[0]) ?? "TBD";
  const pcbs = raw.pricingCategoryBookings ?? activity?.pricingCategoryBookings ?? raw.fields?.priceCategoryBookings ?? [];
  const extras = raw.extraBookings ?? activity?.extraBookings ?? activity?.extras ?? raw.fields?.bookedExtras ?? [];

  const counts = { adults: 0, teens: 0, infants: 0, trailers: 0 };
  const participantList: Array<{ name: string; category: string }> = [];
  for (const pcb of pcbs) {
    const catTitle = pcb.pricingCategory?.title ?? "Adult";
    const key = pricingCategoryKey(catTitle);
    counts[key] += pcb.quantity ?? 1;
    const passengers = [pcb.leadPassenger, ...(pcb.passengers ?? [])].filter((p): p is BokunPassenger => Boolean(p) && typeof p === "object");
    for (const p of passengers) {
      const name = p.fullName || [p.firstName, p.lastName].filter(Boolean).join(" ");
      if (name) participantList.push({ name, category: catTitle });
    }
  }
  if (counts.adults + counts.teens + counts.infants === 0) counts.adults = raw.totalParticipants ?? activity?.totalParticipants ?? raw.fields?.totalParticipants ?? 0;
  for (const ex of extras) {
    const extraTitle = ex.extra?.title ?? ex.title ?? "";
    if (extraTitle.toLowerCase().includes("trailer")) counts.trailers += ex.quantity ?? 1;
  }
  const customer = hasCustomer(raw.customer) ? raw.customer! : {};
  const customerName = customer.fullName || [customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Unknown";

  const bookingIdStr = String(activity?.productConfirmationCode || raw.productConfirmationCode || raw.confirmationCode || raw.id || raw.bookingId || activity?.bookingId || "");
  const channelRef = raw.externalBookingReference || null;
  const externalRef = (raw.parentBookingId ?? activity?.parentBookingId) ? String(raw.parentBookingId ?? activity?.parentBookingId) : null;

  // Bokun's "rate" = the booked pricing option ("Public tour in English",
  // "Regular Bike 2-hour"), NOT the price. On the booking-detail payload it
  // lives on the activity booking as `rateTitle` (+ numeric `rateId`, which
  // maps into activity.rates[] for the human rate code, e.g.
  // "APPIA NAVETTA PUBLIC"). Also mirrored under the invoice product.
  // Verified against parent bookings 98672696 / 99370402.
  const rateFromRates = (() => {
    const rateId = activity?.rateId ?? a0?.rateId;
    if (rateId == null) return null;
    const rates = activity?.activity?.rates ?? a0?.activity?.rates ?? [];
    return rates.find((r) => String(r.id) === String(rateId))?.title ?? null;
  })();
  const rateTitle =
    activity?.rateTitle ||
    activity?.rate?.title ||
    activity?.invoice?.product?.rateTitle ||
    a0?.rateTitle ||
    a0?.rate?.title ||
    a0?.invoice?.product?.rateTitle ||
    raw.rateTitle ||
    raw.rate?.title ||
    raw.invoice?.product?.rateTitle ||
    raw.invoice?.productInvoices?.[0]?.product?.rateTitle ||
    rateFromRates ||
    null;

  const seller = activity?.seller?.title || raw.seller?.title || raw.seller?.companyName || raw.sellerName || null;
  const channel = raw.bookingChannel?.title || raw.bookingChannel?.systemType || raw.channel?.title || raw.channel?.systemType || null;
  const createdRaw = raw.creationDate || raw.createdDate || null;
  const created = createdRaw != null ? new Date(createdRaw as BokunDateValue).toISOString() : null;

  return {
    source: "bokun" as const,
    rental_point_id: rentalPointId,
    booking_id: bookingIdStr,
    channel_booking_ref: channelRef,
    external_booking_ref: externalRef,
    bokun_product_id: productId != null ? String(productId) : null,
    tour_name: productTitle,
    date: dateOnly(startDateTime),
    start_time: fmtTime(startDateTime),
    end_time: computeEnd(startDateTime, endDateTime, durationMinutes),
    meeting_point: meeting,
    customer_name: customerName,
    customer_phone: customer.phoneNumber || null,
    customer_email: customer.email || null,
    adults: counts.adults,
    teens: counts.teens,
    infants: counts.infants,
    trailers: counts.trailers,
    participants: participantList,
    rate: raw.totalPriceAmount ?? moneyAmount(activity?.totalPrice) ?? activity?.totalPriceAmount ?? moneyAmount(raw.totalPrice) ?? moneyAmount(raw.totalPaid) ?? raw.totalAsMoney?.amount ?? raw.paidAmountAsMoney?.amount ?? null,
    rate_title: rateTitle,
    seller,
    booking_channel: channel,
    bokun_created_at: created,
    ticket_sent: !!raw.ticketSent,
    notes: textValue(activity?.notes) ?? textValue(raw.notes) ?? customer.notes ?? null,
    operations_notes: textValue(raw.internalNotes) ?? (raw.paymentStatus || activity?.paidType ? `Payment: ${raw.paymentStatus ?? activity?.paidType}` : null),
    required_tags: inferTags(productTitle, raw.productTags ?? raw.product?.tags),
  };
}

type BokunSearchResponse = {
  results?: BokunBookingFull[];
  items?: Array<BokunBookingFull & { productBookings?: BokunBookingFull[] }>;
  totalHits?: number;
};

function extractSearchBookings(searchRes: BokunSearchResponse | null) {
  const directResults = searchRes?.results ?? [];
  const productBookings = (searchRes?.items ?? []).flatMap((item) => item.productBookings ?? []);
  return productBookings.length ? productBookings : directResults;
}

const PAGE_SIZE = 15;

// Bookings departing within this window are never touched by a resync --
// Bokun guarantees the customer can't change anything that close to
// departure, so re-fetching would just burn an API call for no reason.
// Shared by processBokunImportChunk (skip-if-changed heuristic) and
// healStuckZeroParticipantBookings (which must never override that safety
// margin even though it bypasses the rest of the normal change-detection
// logic).
const CUTOFF_MS = (9 * 60 + 30) * 60 * 1000;

export async function startBokunImport(
  fromDate: string,
  toDate = "2099-12-31",
  trigger: "manual" | "cron" = "manual",
) {
  const { data: runRow, error } = await supabaseAdmin
    .from("bokun_import_runs")
    .insert({ from_date: fromDate, to_date: toDate, trigger, next_page: 1 })
    .select("id")
    .single();
  if (error || !runRow) throw new Error(`Could not create run: ${error?.message ?? "unknown"}`);
  return { runId: runRow.id as string };
}

/**
 * Process a single page of an in-flight Bokun import run.
 * Returns done=true once there are no more pages.
 */
export async function processBokunImportChunk(runId: string, detailConcurrency = 10) {
  const { data: run, error: loadErr } = await supabaseAdmin
    .from("bokun_import_runs")
    .select("*")
    .eq("id", runId)
    .single();
  if (loadErr || !run) throw new Error(`Run not found: ${runId}`);
  if (run.finished_at) {
    return { done: true, totalSeen: run.total_seen, totalHits: run.total_hits, page: run.next_page };
  }

  const page = run.next_page ?? 1;
  let totalSeen = run.total_seen ?? 0;
  let created = run.created ?? 0;
  let updated = run.updated ?? 0;
  let skipped = run.skipped ?? 0;
  const errors: string[] = Array.isArray(run.errors) ? [...(run.errors as string[])] : [];
  let fatal: string | null = null;
  let done = false;

  try {
    const fromMs = Date.parse(`${run.from_date}T00:00:00Z`);
    const toMs = Date.parse(`${run.to_date}T23:59:59Z`);

    // Build name → id map of rental points so rental bookings can be routed.
    // Cached for 5 minutes — rental points rarely change and this function is
    // invoked many times per sync run (once per chunk). Avoids thousands of
    // identical SELECTs against rental_points (major Cloud egress saver).
    const rentalPointIdByName = await getRentalPointNameMap();

    const searchRes = await bokunFetch("POST", "/booking.json/booking-search", {
      bookingRole: "SELLER",
      startDateRange: { from: fromMs, to: toMs },
      pageSize: PAGE_SIZE,
      page,
      sortField: "startDate",
      sortOrder: "ASC",
    }) as BokunSearchResponse;

    const totalHits = typeof searchRes?.totalHits === "number" ? searchRes.totalHits : run.total_hits;

    const results = extractSearchBookings(searchRes);
    if (results.length === 0) {
      done = true;
    } else {
      const liveSummaries: BokunBookingFull[] = [];
      for (const summary of results) {
        totalSeen++;
        if ((summary.status ?? "").toUpperCase() === "CANCELLED") { skipped++; continue; }
        liveSummaries.push(summary);
      }

      // Cost fix (see get_bokun_cron_status / audit discussion): this used
      // to fetch full Bokun detail (a separate API call + JSON download) for
      // EVERY booking on EVERY 5-minute cron tick, all day, forever -- even
      // though existing bookings were never actually written back with that
      // detail (the resulting data was simply discarded once a booking_id
      // was already in `shifts`). That made the 10h-cutoff skip below the
      // *only* real savings, and it only covered bookings departing within
      // ~10 hours -- a tiny fraction of a 13-month sync window.
      //
      // We do still need to catch real changes to *upcoming* bookings
      // (pax count, time changes) -- that's the whole point of re-scanning
      // the window on a schedule rather than importing once. The fix is to
      // use the cheap summary-level fields (already present on every page
      // of search results, no extra API call) to check whether an already-
      // imported booking looks unchanged, and only pay for the detail fetch
      // when it's a brand-new booking_id or the summary suggests something
      // about it differs from what we have stored.
      const cutoffThreshold = Date.now() + CUTOFF_MS;

      const summaryBookingId = (s: BokunBookingFull): string | null => {
        const id = s.productConfirmationCode ?? s.confirmationCode ?? s.bookingId ?? s.id;
        return id != null ? String(id) : null;
      };
      const summaryStartMs = (s: BokunBookingFull): number | null => {
        const raw = s.startDateTime ?? s.startDate;
        if (raw == null) return null;
        const ms = typeof raw === "number" ? raw : Date.parse(String(raw));
        return Number.isFinite(ms) ? ms : null;
      };

      type ExistingShiftRow = {
        booking_id: string;
        date: string;
        start_time: string;
        adults: number;
        teens: number;
        infants: number;
        rate_title: string | null;

      };

      // Look up EVERY booking_id on this page up front (one query), not just
      // the ones inside the 10h cutoff window -- we need to know what we
      // already have stored to compare against, for every summary.
      const pageBookingIds = Array.from(
        new Set(liveSummaries.map(summaryBookingId).filter((id): id is string => !!id)),
      );
      const existingByBookingId = new Map<string, ExistingShiftRow>();
      if (pageBookingIds.length > 0) {
        const { data: existingRowsPage } = await supabaseAdmin
          .from("shifts")
          .select("booking_id, date, start_time, adults, teens, infants, rate_title")
          .eq("source", "bokun")
          .in("booking_id", pageBookingIds);
        for (const r of existingRowsPage ?? []) {
          if (r.booking_id) existingByBookingId.set(r.booking_id as string, r as ExistingShiftRow);
        }
      }

      // Does this summary look different from what we already have stored?
      // Only checks fields Bokun search results actually expose (start
      // time/date, total pax) -- if we can't tell, we fetch detail to be
      // safe rather than silently missing a real change.
      const summaryLooksChanged = (s: BokunBookingFull, existing: ExistingShiftRow): boolean => {
        const startMs = summaryStartMs(s);
        if (startMs !== null) {
          if (dateOnly(startMs) !== existing.date) return true;
          if (fmtTime(startMs) !== existing.start_time) return true;
        }
        const summaryTotal = s.totalParticipants ?? s.fields?.totalParticipants;
        if (typeof summaryTotal === "number") {
          const storedTotal = existing.adults + existing.teens + existing.infants;
          if (summaryTotal !== storedTotal) return true;
        }
        return false;
      };

      const summariesToFetch: BokunBookingFull[] = [];
      for (const s of liveSummaries) {
        const bId = summaryBookingId(s);
        const existing = bId ? existingByBookingId.get(bId) : undefined;
        if (!existing) {
          // Never seen before -- always needs a full detail fetch to create it.
          summariesToFetch.push(s);
          continue;
        }
        // A stored zero-participant count is never actually correct -- every
        // real booking has at least one person on it. Always worth a real
        // detail re-fetch to correct it, *including* inside the near-
        // departure cutoff below: that cutoff exists to avoid wasting an
        // API call re-checking a booking Bokun guarantees a customer can't
        // have changed any more -- a safety margin for otherwise-good data.
        // It was never meant to protect a value we already know is wrong;
        // re-fetching a same-day booking that's stuck at 0 can't clobber a
        // legitimate change, since there's no legitimate value to lose.
        if (existing.adults + existing.teens + existing.infants === 0) {
          summariesToFetch.push(s);
          continue;
        }
        const startMs = summaryStartMs(s);
        if (startMs !== null && startMs <= cutoffThreshold) {
          // Inside the 10h cutoff + already imported + not stuck at 0 →
          // Bokun guarantees the customer cannot have changed it. Skip.
          skipped++;
          continue;
        }
        if (!summaryLooksChanged(s, existing)) {
          // Already imported and nothing in the summary suggests a change.
          skipped++;
          continue;
        }
        // Already imported but looks changed (time or pax differ) -- worth
        // the detail fetch so we can update the stored row.
        summariesToFetch.push(s);
      }

      const fullBookings: BokunBookingFull[] = [];
      for (let i = 0; i < summariesToFetch.length; i += detailConcurrency) {
        const batch = summariesToFetch.slice(i, i + detailConcurrency);
        const settled = await Promise.all(
          batch.map(async (summary): Promise<BokunBookingFull | null> => {
            const detailId = summary.parentBookingId ?? summary.bookingId ?? summary.id;
            if (detailId == null) return null;
            // Retry once on transient failures (rate limit, timeout, brief
            // 5xx) before giving up.
            //
            // On double-failure this used to fall back to returning
            // `summary` itself -- Bokun's sparse search-summary shape,
            // which has no pricingCategoryBookings/totalParticipants (and,
            // often, no parentBookingId either). That silently produced a
            // shift row with adults/teens/infants = 0 and
            // external_booking_ref = null for a *new* booking -- or, worse,
            // for an *already-imported* booking whose summary looked
            // changed (date/time shift), the same zero-derived counts got
            // written straight into the update patch below, overwriting
            // previously-correct participant data with 0 just because a
            // network blip happened to hit at the wrong moment.
            //
            // Returning null instead means: don't write anything for this
            // booking this scan. summaryLooksChanged() (existing rows) and
            // the plain !existing check (new rows) both guarantee it gets
            // reconsidered on the very next scan with a fresh retry budget
            // -- a temporarily-skipped booking is far cheaper than a
            // silently-corrupted one.
            for (let attempt = 0; attempt < 2; attempt++) {
              try {
                const parent = (await bokunFetch(
                  "GET",
                  `/booking.json/booking/${detailId}`,
                )) as BokunBookingFull;
                return {
                  ...parent,
                  id: summary.id,
                  bookingId: summary.bookingId ?? summary.id,
                  productConfirmationCode: summary.productConfirmationCode,
                  parentBookingId: summary.parentBookingId ?? parent.bookingId,
                } as BokunBookingFull;
              } catch (e) {
                if (attempt === 1) {
                  errors.push(`Detail ${detailId}: ${(e as Error).message}`);
                  return null;
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
              }
            }
            return null;
          }),
        );
        for (const s of settled) {
          if (s === null) {
            skipped++;
          } else {
            fullBookings.push(s);
          }
        }
      }

      // First-of-current-month threshold (UTC). Bokun bookings whose travel
      // date OR booking-creation date falls before this are skipped entirely.
      const _now = new Date();
      const monthStart = `${_now.getUTCFullYear()}-${String(_now.getUTCMonth() + 1).padStart(2, "0")}-01`;

      const rows: ReturnType<typeof mapToShiftRow>[] = [];
      for (const full of fullBookings) {
        const row = mapToShiftRow(full, rentalPointIdByName);
        if (!row || !row.booking_id) { skipped++; continue; }
        const travelBefore = typeof row.date === "string" && row.date < monthStart;
        const createdBefore =
          typeof row.bokun_created_at === "string" &&
          row.bokun_created_at.slice(0, 10) < monthStart;
        if (travelBefore || createdBefore) { skipped++; continue; }
        rows.push(row);
      }

      if (rows.length > 0) {
        // newRows: booking_id we've never stored before → insert fresh.
        // updateRows: already existed (we only got here because the summary
        // looked changed) → update ONLY the customer-controlled fields
        // (time, pax breakdown, contact info) that Bokun actually owns.
        // Deliberately never touches assigned_staff_id, status,
        // pending_expires_at, meeting_point, rate, notes, operations_notes,
        // or required_tags -- those may have been hand-edited by an admin
        // after the original import, and a Bokun resync should never
        // silently clobber that work.
        const newRows = rows.filter((r) => !existingByBookingId.has(r!.booking_id!));
        const updateRows = rows.filter((r) => existingByBookingId.has(r!.booking_id!));
        skipped += rows.length - newRows.length - updateRows.length;

        for (const r of updateRows) {
          const existingRow = existingByBookingId.get(r!.booking_id!);
          const patch = {
            date: r!.date,
            start_time: r!.start_time,
            end_time: r!.end_time,
            adults: r!.adults,
            teens: r!.teens,
            infants: r!.infants,
            trailers: r!.trailers,
            participants: r!.participants,
            customer_name: r!.customer_name,
            customer_phone: r!.customer_phone,
            customer_email: r!.customer_email,
            // Fill-only, never overwrite: rows created by the Bokun webhook
            // (which historically didn't map the rate at all) sit here with
            // rate_title = NULL forever, since resyncs only patch
            // customer-controlled fields. Setting it when it's missing
            // recovers those without clobbering an admin's manual override.
            ...(!existingRow?.rate_title && r!.rate_title
              ? { rate_title: r!.rate_title }
              : {}),
          };

          const { error: updateErr } = await supabaseAdmin
            .from("shifts")
            .update(patch)
            .eq("source", "bokun")
            .eq("booking_id", r!.booking_id!);
          if (updateErr) {
            errors.push(`Update ${r!.booking_id}: ${updateErr.message}`);
          } else {
            updated++;
          }
        }

        if (newRows.length > 0) {
          const payload = newRows.map((r) => ({
            ...r!,
            status: "unassigned" as const,
            assigned_staff_id: null,
            pending_expires_at: null,
          }));

          const { error: upsertErr } = await supabaseAdmin
            .from("shifts")
            .upsert(payload, { onConflict: "source,booking_id" });
          if (upsertErr) {
            errors.push(`Upsert page ${page}: ${upsertErr.message}`);
          } else {
            created += newRows.length;
          }
        }
      }




      if (results.length < PAGE_SIZE) done = true;
    }

    const nextPage = done ? page : page + 1;
    await supabaseAdmin
      .from("bokun_import_runs")
      .update({
        total_seen: totalSeen,
        total_hits: totalHits ?? null,
        created,
        updated,
        skipped,
        errors: errors.slice(0, 50),
        next_page: nextPage,
        ...(done ? {
          finished_at: new Date().toISOString(),
          success: errors.length === 0,
        } : {}),
      })
      .eq("id", runId);

    return { done, totalSeen, totalHits, page, created, updated, skipped, errors: errors.slice(0, 20) };
  } catch (e) {
    fatal = (e as Error).message;
    await supabaseAdmin
      .from("bokun_import_runs")
      .update({
        finished_at: new Date().toISOString(),
        total_seen: totalSeen,
        created,
        updated,
        skipped,
        errors: errors.slice(0, 50),
        success: false,
        error_message: fatal,
      })
      .eq("id", runId);
    throw e;
  }
}

/**
 * Legacy single-shot helper kept for the cron path (one page per tick).
 */
export async function runBokunImport(
  fromDate: string,
  toDate = "2099-12-31",
  trigger: "manual" | "cron" = "manual",
  options: { maxPages?: number } = {},
) {
  const { runId } = await startBokunImport(fromDate, toDate, trigger);
  return continueBokunImport(runId, options);
}

export async function continueBokunImport(
  runId: string,
  options: { maxPages?: number } = {},
) {
  const maxPages = options.maxPages ?? 1;
  let lastResult: Awaited<ReturnType<typeof processBokunImportChunk>> | null = null;
  for (let i = 0; i < maxPages; i++) {
    lastResult = await processBokunImportChunk(runId);
    if (lastResult.done) break;
  }
  return {
    runId,
    totalSeen: lastResult?.totalSeen ?? 0,
    totalHits: lastResult?.totalHits ?? null,
    done: lastResult?.done ?? false,
    page: lastResult?.page ?? null,
    created: lastResult?.created ?? 0,
    updated: lastResult?.updated ?? 0,
    skipped: lastResult?.skipped ?? 0,
    errors: lastResult?.errors ?? [],
  };
}

/**
 * processBokunImportChunk() finds changed/new bookings by paging through
 * Bokun's search results (sorted by startDate) and comparing each summary
 * against what's already stored. That works well, but it depends on every
 * relevant booking actually showing up on some page of some run.
 *
 * In practice a small number of far-future bookings have been observed to
 * go unseen across multiple independent full sweeps (confirmed: not a
 * duplicate-row/id-mismatch bug, not a payload-parsing bug -- Bokun's
 * detail API returns perfectly good pricingCategoryBookings for these when
 * fetched directly). The likely cause is pagination drift/tie-breaking on
 * Bokun's side when many bookings share an identical startDateTime, or new
 * bookings landing mid-sweep and shifting offsets -- neither of which this
 * codebase controls.
 *
 * Rather than trying to make Bokun's search pagination airtight, this
 * bypasses it entirely for the narrow case that actually matters: a row we
 * already have, already know is wrong (adults+teens+infants = 0, which is
 * never a real value), and already have a direct Bokun id for
 * (external_booking_ref, captured from parentBookingId at import time).
 * One GET per row, no search/pagination involved at all.
 *
 * Bounded to `limit` rows per call so a single invocation stays cheap;
 * call it repeatedly (like the main sync) if there's a large backlog.
 */
export async function healStuckZeroParticipantBookings(limit = 50) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: stuckRows, error } = await supabaseAdmin
    .from("shifts")
    .select("id, booking_id, external_booking_ref, date, start_time")
    .eq("source", "bokun")
    .eq("adults", 0)
    .eq("teens", 0)
    .eq("infants", 0)
    .gte("date", todayIso)
    .order("date", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Could not load stuck rows: ${error.message}`);

  const rentalPointIdByName = await getRentalPointNameMap();
  let checked = 0;
  let healed = 0;
  let stillZero = 0;
  let noRef = 0;
  const errors: string[] = [];

  for (const row of stuckRows ?? []) {
    // No near-departure cutoff here, unlike the main sync -- every row this
    // function selects is already known to be stuck at 0, which is never a
    // legitimate value. The cutoff exists to avoid re-fetching a booking
    // Bokun guarantees a customer can't have changed any more -- a safety
    // margin for otherwise-good data, not a reason to leave known-wrong
    // data uncorrected right up until departure.
    if (!row.external_booking_ref) {
      noRef++;
      continue;
    }
    checked++;
    try {
      const detail = (await bokunFetch(
        "GET",
        `/booking.json/booking/${row.external_booking_ref}`,
      )) as BokunBookingFull;
      const mapped = mapToShiftRow(detail, rentalPointIdByName);
      if (!mapped || mapped.adults + mapped.teens + mapped.infants === 0) {
        stillZero++;
        continue;
      }
      // Same scope as the main sync's updateRows patch: only the
      // customer-controlled fields Bokun actually owns. Never touches
      // assigned_staff_id, status, meeting_point, rate, notes, tags, etc.
      const { error: updErr } = await supabaseAdmin
        .from("shifts")
        .update({
          adults: mapped.adults,
          teens: mapped.teens,
          infants: mapped.infants,
          trailers: mapped.trailers,
          participants: mapped.participants,
          customer_name: mapped.customer_name,
          customer_phone: mapped.customer_phone,
          customer_email: mapped.customer_email,
        })
        .eq("id", row.id);
      if (updErr) {
        errors.push(`${row.booking_id}: ${updErr.message}`);
        continue;
      }
      healed++;
    } catch (e) {
      errors.push(`${row.booking_id}: ${(e as Error).message}`);
    }
  }

  return { checked, healed, stillZero, noRef, errors };
}

/**
 * healStuckZeroParticipantBookings() can only heal a row that has an
 * external_booking_ref (the parent booking id) to fetch by. A batch of
 * older rows -- imported before this session's fixes existed, likely via
 * the original no-retry code path that fell back to a bare search-summary
 * object lacking parentBookingId -- have external_booking_ref = NULL and
 * can never be healed by that function no matter how many times it runs.
 *
 * Confirmed by direct testing (see chat) that the obvious shortcuts don't
 * work: `/booking.json/booking/{id}` only accepts a real parent booking
 * id, not the activity-level id embedded in booking_id (e.g. the
 * "135626714" in "BIC-T135626714") -- that 404s. What does work: Bokun's
 * `/booking.json/booking-search` with a `textFilter` set to the booking_id
 * string reliably resolves to exactly one row, whose own `id` (or
 * `parentBookingId`, if Bokun ever returns one directly) is the real
 * parent id -- confirmed against two known-null-ref rows, both resolving
 * to the correct parent and returning real passenger data on the
 * follow-up detail fetch.
 *
 * This is a one-time recovery pass: it only sets external_booking_ref on
 * rows that don't have one. It does NOT touch participant counts itself --
 * once a row has a ref, the next call to healStuckZeroParticipantBookings
 * picks it up normally through the already-tested path.
 *
 * textFilter is Bokun's free-text search, not an exact-match filter, so
 * this only acts when the search returns exactly one hit -- anything
 * ambiguous is left alone rather than guessed at. Runs sequentially with a
 * delay between requests to stay well under Bokun's rate limit.
 */
export async function backfillMissingExternalBookingRefs(limit = 40) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: rows, error } = await supabaseAdmin
    .from("shifts")
    .select("id, booking_id, external_booking_ref, date")
    .eq("source", "bokun")
    .eq("adults", 0)
    .eq("teens", 0)
    .eq("infants", 0)
    .is("external_booking_ref", null)
    .gte("date", todayIso)
    .order("date", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Could not load rows missing external_booking_ref: ${error.message}`);

  let checked = 0;
  let backfilled = 0;
  let ambiguous = 0;
  const errors: string[] = [];

  for (const row of rows ?? []) {
    if (!row.booking_id) continue;
    checked++;
    try {
      const searchRes = (await bokunFetch("POST", "/booking.json/booking-search", {
        bookingRole: "SELLER",
        textFilter: row.booking_id,
        pageSize: 5,
        page: 1,
      })) as BokunSearchResponse;
      const hits = extractSearchBookings(searchRes);
      if (hits.length !== 1) {
        // textFilter is free-text, not exact-match -- 0 or 2+ hits means we
        // can't be sure which row (if any) is the right one. Don't guess.
        ambiguous++;
        continue;
      }
      const parentId = hits[0].parentBookingId ?? hits[0].id;
      if (parentId == null) {
        ambiguous++;
        continue;
      }
      const { error: updErr } = await supabaseAdmin
        .from("shifts")
        .update({ external_booking_ref: String(parentId) })
        .eq("id", row.id);
      if (updErr) {
        errors.push(`${row.booking_id}: ${updErr.message}`);
        continue;
      }
      backfilled++;
    } catch (e) {
      errors.push(`${row.booking_id}: ${(e as Error).message}`);
    }
    // Bokun rate-limits search; stay well under it since this runs
    // sequentially over a real (if small) batch.
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  return { checked, backfilled, ambiguous, errors };
}

/**
 * One-off/recurring recovery pass for `rate_title` (Bokun's booked pricing
 * option -- "Public tour in English", "Regular Bike 2-hour" -- NOT the price).
 *
 * Rows created by the Bokun webhook never had the rate mapped at all, and a
 * later resync only patches customer-controlled fields, so those rows stay
 * NULL forever even though Bokun has the value. This re-fetches the booking
 * detail for rows still missing it and fills it in. Fill-only: never
 * overwrites a value an admin set manually.
 */
export async function backfillMissingRateTitles(limit = 40) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: rows, error } = await supabaseAdmin
    .from("shifts")
    .select("id, booking_id, external_booking_ref, date")
    .eq("source", "bokun")
    .is("rate_title", null)
    .not("external_booking_ref", "is", null)
    .gte("date", todayIso)
    .order("date", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Could not load rows missing rate_title: ${error.message}`);

  let checked = 0;
  let backfilled = 0;
  let notFound = 0;
  const errors: string[] = [];
  const rentalPointIdByName = await getRentalPointNameMap();

  for (const row of rows ?? []) {
    if (!row.external_booking_ref) continue;
    checked++;
    try {
      const detail = (await bokunFetch(
        "GET",
        `/booking.json/booking/${row.external_booking_ref}`,
      )) as BokunBookingFull;
      const mapped = mapToShiftRow(detail, rentalPointIdByName);
      const rateTitle = mapped?.rate_title ?? null;
      if (!rateTitle) {
        notFound++;
        continue;
      }
      const { error: updErr } = await supabaseAdmin
        .from("shifts")
        .update({ rate_title: rateTitle })
        .eq("id", row.id)
        .is("rate_title", null);
      if (updErr) {
        errors.push(`${row.booking_id}: ${updErr.message}`);
        continue;
      }
      backfilled++;
    } catch (e) {
      errors.push(`${row.booking_id}: ${(e as Error).message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return { checked, backfilled, notFound, errors };
}

export async function assertAdmin(accessToken: string) {

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(accessToken);
  if (userErr || !userData.user) throw new Error("Not authenticated");
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  if (!roles?.some((r) => r.role === "admin")) throw new Error("Admin only");
  // Bokun Runs diagnostics is further restricted to a single allowlisted account.
  if ((userData.user.email ?? "").toLowerCase() !== "marallvalipour@gmail.com") {
    throw new Error("Not authorized for Bokun Runs");
  }
}


