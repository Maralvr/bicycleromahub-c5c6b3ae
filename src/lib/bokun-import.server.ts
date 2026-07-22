import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isExcludedBokunProductId, isExcludedTourName } from "./excluded-bokun-products";
import { rentalLocationForProductId } from "./rental-products";
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

async function bokunFetch(method: "GET" | "POST", path: string, body?: unknown) {
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
    activity?: { title?: string; durationMinutes?: number; durationHours?: number; startPoints?: Array<{ title?: string; address?: string | BokunAddress }> };
    product?: { title?: string; tags?: string[]; id?: number | string };
    title?: string;
    startDateTime?: BokunDateValue;
    endDateTime?: BokunDateValue;
    pickupPlace?: { title?: string; address?: string | BokunAddress };
    startPoint?: { title?: string; address?: string | BokunAddress };
    pickup?: false | { title?: string; address?: string | BokunAddress };
    rateTitle?: string;
    rate?: { title?: string };
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
  const rentalLocation = rentalLocationForProductId(productId);
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

  const rateTitle = activity?.rateTitle || activity?.rate?.title || raw.rateTitle || raw.rate?.title || a0?.rateTitle || a0?.rate?.title || null;
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
      const CUTOFF_MS = (9 * 60 + 30) * 60 * 1000;
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
          .select("booking_id, date, start_time, adults, teens, infants")
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
        // A stored zero-participant count is never actually correct -- every
        // real booking has at least one person on it. If we ever see this,
        // treat it as "changed" unconditionally so a booking that got stuck
        // at 0 (e.g. a past detail-fetch failure silently fell back to the
        // sparse search-summary shape) gets a real detail re-fetch on the
        // very next scan instead of being skipped forever by the check
        // below, which can't detect a wrong value it was never able to see.
        if (existing.adults + existing.teens + existing.infants === 0) return true;
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
        const isDiag = bId === DIAG_ID;
        const existing = bId ? existingByBookingId.get(bId) : undefined;
        if (isDiag) {
          console.log(`[DIAG ${DIAG_ID}] existing lookup`, {
            bId,
            found: !!existing,
            existing,
          });
        }
        if (!existing) {
          if (isDiag) console.log(`[DIAG ${DIAG_ID}] → summariesToFetch (no existing)`);
          summariesToFetch.push(s);
          continue;
        }
        const startMs = summaryStartMs(s);
        if (startMs !== null && startMs <= cutoffThreshold) {
          if (isDiag) console.log(`[DIAG ${DIAG_ID}] SKIP: inside 10h cutoff`, { startMs, cutoffThreshold });
          skipped++;
          continue;
        }
        // Inline replicate summaryLooksChanged to report WHY
        let changedReason: string | null = null;
        if (startMs !== null) {
          if (dateOnly(startMs) !== existing.date) changedReason = `date ${dateOnly(startMs)} != ${existing.date}`;
          else if (fmtTime(startMs) !== existing.start_time) changedReason = `time ${fmtTime(startMs)} != ${existing.start_time}`;
        }
        if (!changedReason && existing.adults + existing.teens + existing.infants === 0) {
          changedReason = "stored pax total = 0";
        }
        if (!changedReason) {
          const summaryTotal = s.totalParticipants ?? s.fields?.totalParticipants;
          if (typeof summaryTotal === "number") {
            const storedTotal = existing.adults + existing.teens + existing.infants;
            if (summaryTotal !== storedTotal) changedReason = `pax ${summaryTotal} != ${storedTotal}`;
          }
        }
        if (isDiag) {
          console.log(`[DIAG ${DIAG_ID}] summaryLooksChanged`, {
            changed: !!changedReason,
            reason: changedReason,
            summaryTotal: s.totalParticipants ?? s.fields?.totalParticipants,
            storedPax: existing.adults + existing.teens + existing.infants,
          });
        }
        if (!changedReason) {
          skipped++;
          continue;
        }
        summariesToFetch.push(s);
      }

      const fullBookings: BokunBookingFull[] = [];
      for (let i = 0; i < summariesToFetch.length; i += detailConcurrency) {
        const batch = summariesToFetch.slice(i, i + detailConcurrency);
        const settled = await Promise.all(
          batch.map(async (summary) => {
            const detailId = summary.parentBookingId ?? summary.bookingId ?? summary.id;
            const isDiag = summaryBookingId(summary) === DIAG_ID;
            if (isDiag) console.log(`[DIAG ${DIAG_ID}] entering detail fetch`, { detailId });
            if (detailId == null) {
              if (isDiag) console.log(`[DIAG ${DIAG_ID}] no detailId, returning summary`);
              return summary;
            }
            for (let attempt = 0; attempt < 2; attempt++) {
              try {
                const parent = (await bokunFetch(
                  "GET",
                  `/booking.json/booking/${detailId}`,
                )) as BokunBookingFull;
                if (isDiag) {
                  console.log(`[DIAG ${DIAG_ID}] detail fetch OK attempt=${attempt}`, {
                    parentBookingId: parent.bookingId,
                    activityBookings: Array.isArray(parent.activityBookings) ? parent.activityBookings.length : null,
                  });
                }
                return {
                  ...parent,
                  id: summary.id,
                  bookingId: summary.bookingId ?? summary.id,
                  productConfirmationCode: summary.productConfirmationCode,
                  parentBookingId: summary.parentBookingId ?? parent.bookingId,
                } as BokunBookingFull;
              } catch (e) {
                if (isDiag) console.log(`[DIAG ${DIAG_ID}] detail fetch FAIL attempt=${attempt}`, { err: (e as Error).message });
                if (attempt === 1) {
                  errors.push(`Detail ${detailId}: ${(e as Error).message}`);
                  return summary;
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
              }
            }
            return summary;
          }),
        );
        fullBookings.push(...settled);
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

export async function assertAdmin(accessToken: string) {
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(accessToken);
  if (userErr || !userData.user) throw new Error("Not authenticated");
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  if (!roles?.some((r) => r.role === "admin")) throw new Error("Admin only");
}

