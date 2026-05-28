import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PRICING_MAP: Record<string, "adults" | "teens" | "infants"> = {
  adult: "adults", adults: "adults", person: "adults", people: "adults", participant: "adults", participants: "adults", pax: "adults",
  teen: "teens", teenager: "teens", teens: "teens", child: "teens", children: "teens",
  infant: "infants", infants: "infants", baby: "infants",
};

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
  if (typeof value === "string") return value || null;
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

function mapToShiftRow(raw: BokunBookingFull) {
  const a0 = raw.activityBookings?.[0];
  const detailActivity = raw.activityBookings?.find((a) => String(a.bookingId ?? a.productConfirmationCode ?? "") === String(raw.id ?? raw.bookingId ?? raw.productConfirmationCode ?? "")) ?? a0;
  const activity = detailActivity ?? a0;
  const productTitle = activity?.product?.title ?? activity?.activity?.title ?? activity?.title ?? raw.product?.title ?? raw.productTitle ?? raw.title ?? "Bokun booking";
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
    booking_id: bookingIdStr,
    channel_booking_ref: channelRef,
    external_booking_ref: externalRef,
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

export async function runBokunImport(
  fromDate: string,
  toDate = "2099-12-31",
  trigger: "manual" | "cron" = "manual",
  options: { maxPages?: number; detailConcurrency?: number } = {},
) {
  const maxPages = options.maxPages ?? (trigger === "cron" ? 1 : 200);
  const detailConcurrency = options.detailConcurrency ?? 10;
  let page = 1;
  const pageSize = 50;
  let totalSeen = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  const { data: runRow } = await supabaseAdmin
    .from("bokun_import_runs")
    .insert({ from_date: fromDate, to_date: toDate, trigger })
    .select("id")
    .single();
  const runId = runRow?.id as string | undefined;

  let fatal: string | null = null;

  try {
    while (true) {
      let searchRes: BokunSearchResponse | null = null;
      try {
        const fromMs = Date.parse(`${fromDate}T00:00:00Z`);
        const toMs = Date.parse(`${toDate}T23:59:59Z`);
        searchRes = await bokunFetch("POST", "/booking.json/booking-search", {
          bookingRole: "SELLER",
          startDateRange: { from: fromMs, to: toMs },
          pageSize,
          page,
          sortField: "startDate",
          sortOrder: "ASC",
        });
      } catch (e) {
        errors.push(`Search page ${page}: ${(e as Error).message}`);
        break;
      }

      // Capture total hits on first successful page so the UI can show progress
      if (page === 1 && runId && typeof searchRes?.totalHits === "number") {
        await supabaseAdmin
          .from("bokun_import_runs")
          .update({ total_hits: searchRes.totalHits })
          .eq("id", runId);
      }

      const results = extractSearchBookings(searchRes);
      if (results.length === 0) break;

      // Filter out cancelled bookings up front
      const liveSummaries: BokunBookingFull[] = [];
      for (const summary of results) {
        totalSeen++;
        if ((summary.status ?? "").toUpperCase() === "CANCELLED") { skipped++; continue; }
        liveSummaries.push(summary);
      }

      // Fetch booking details in parallel batches
      const fullBookings: BokunBookingFull[] = [];
      for (let i = 0; i < liveSummaries.length; i += detailConcurrency) {
        const batch = liveSummaries.slice(i, i + detailConcurrency);
        const settled = await Promise.all(batch.map(async (summary) => {
          const detailId = summary.parentBookingId ?? summary.bookingId ?? summary.id;
          if (detailId == null) return summary;
          try {
            const parent = await bokunFetch("GET", `/booking.json/booking/${detailId}`) as BokunBookingFull;
            return {
              ...parent,
              id: summary.id,
              bookingId: summary.bookingId ?? summary.id,
              productConfirmationCode: summary.productConfirmationCode,
              parentBookingId: summary.parentBookingId ?? parent.bookingId,
            } as BokunBookingFull;
          } catch (e) {
            errors.push(`Detail ${detailId}: ${(e as Error).message}`);
            return summary;
          }
        }));
        fullBookings.push(...settled);
      }

      // Upsert each booking (serial — DB writes are fast and we want stable errors)
      for (const full of fullBookings) {
        const row = mapToShiftRow(full);
        if (!row || !row.booking_id) { skipped++; continue; }

        const { data: existing } = await supabaseAdmin
          .from("shifts")
          .select("id")
          .eq("source", "bokun")
          .eq("booking_id", row.booking_id)
          .maybeSingle();

        if (existing) {
          const { error } = await supabaseAdmin
            .from("shifts")
            .update(row)
            .eq("id", existing.id);
          if (error) errors.push(`Update ${row.booking_id}: ${error.message}`);
          else updated++;
        } else {
          const { error } = await supabaseAdmin
            .from("shifts")
            .insert({ ...row, status: "unassigned" });
          if (error) errors.push(`Insert ${row.booking_id}: ${error.message}`);
          else created++;
        }
      }

      // Push incremental progress so the UI can render a live %
      if (runId) {
        await supabaseAdmin
          .from("bokun_import_runs")
          .update({ total_seen: totalSeen, created, updated, skipped })
          .eq("id", runId);
      }

      if (results.length < pageSize) break;
      page++;
      if (page > maxPages) break;
    }
  } catch (e) {
    fatal = (e as Error).message;
  }

  if (runId) {
    await supabaseAdmin
      .from("bokun_import_runs")
      .update({
        finished_at: new Date().toISOString(),
        total_seen: totalSeen,
        created,
        updated,
        skipped,
        errors: errors.slice(0, 50),
        success: !fatal && errors.length === 0,
        error_message: fatal,
      })
      .eq("id", runId);
  }

  return { totalSeen, created, updated, skipped, errors: errors.slice(0, 20), runId };
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
