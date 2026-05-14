import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PRICING_MAP: Record<string, "adults" | "teens" | "infants"> = {
  adult: "adults", adults: "adults",
  teen: "teens", teenager: "teens", teens: "teens", child: "teens", children: "teens",
  infant: "infants", infants: "infants", baby: "infants",
};

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

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:00`;
}

function computeEnd(start: string, end?: string, durationMinutes?: number) {
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

interface BokunBookingFull {
  id?: number | string;
  bookingId?: number | string;
  confirmationCode?: string;
  productConfirmationCode?: string;
  parentBookingId?: number | string;
  externalBookingReference?: string;
  productTitle?: string;
  product?: { title?: string; tags?: string[] };
  startDateTime?: string;
  startDate?: string;
  endDateTime?: string;
  durationMinutes?: number;
  pickupPlace?: { title?: string; address?: string };
  startPoint?: { title?: string; address?: string };
  customer?: {
    firstName?: string;
    lastName?: string;
    fullName?: string;
    phoneNumber?: string;
    email?: string;
    notes?: string;
  };
  pricingCategoryBookings?: Array<{
    pricingCategory: { title: string };
    quantity: number;
    passengers?: Array<{ firstName?: string; lastName?: string; fullName?: string }>;
  }>;
  extraBookings?: Array<{ extra: { title: string }; quantity: number }>;
  totalPrice?: number;
  totalAsMoney?: { amount?: number; currency?: string };
  currency?: string;
  notes?: string;
  internalNotes?: string;
  productTags?: string[];
  status?: string;
  creationDate?: string;
  createdDate?: string;
  ticketSent?: boolean;
  seller?: { title?: string; companyName?: string };
  sellerName?: string;
  bookingChannel?: { title?: string; systemType?: string };
  rateTitle?: string;
  rate?: { title?: string };
  activityBookings?: Array<{
    activity?: { title?: string; durationMinutes?: number };
    startDateTime?: string;
    endDateTime?: string;
    pickupPlace?: { title?: string; address?: string };
    startPoint?: { title?: string; address?: string };
    rateTitle?: string;
    rate?: { title?: string };
    pricingCategoryBookings?: Array<{
      pricingCategory: { title: string };
      quantity: number;
      passengers?: Array<{ firstName?: string; lastName?: string; fullName?: string }>;
    }>;
    extraBookings?: Array<{ extra: { title: string }; quantity: number }>;
  }>;
}

function mapToShiftRow(raw: BokunBookingFull) {
  const a0 = raw.activityBookings?.[0];
  const productTitle = raw.product?.title ?? raw.productTitle ?? a0?.activity?.title ?? "Bokun booking";
  const startDateTime = raw.startDateTime ?? raw.startDate ?? a0?.startDateTime;
  if (!startDateTime) return null;
  const endDateTime = raw.endDateTime ?? a0?.endDateTime;
  const durationMinutes = raw.durationMinutes ?? a0?.activity?.durationMinutes;
  const pickupPlace = raw.pickupPlace ?? a0?.pickupPlace;
  const startPoint = raw.startPoint ?? a0?.startPoint;
  const pcbs = raw.pricingCategoryBookings ?? a0?.pricingCategoryBookings ?? [];
  const extras = raw.extraBookings ?? a0?.extraBookings ?? [];

  const counts = { adults: 0, teens: 0, infants: 0, trailers: 0 };
  const participantList: Array<{ name: string; category: string }> = [];
  for (const pcb of pcbs) {
    const catTitle = pcb.pricingCategory.title;
    const key = PRICING_MAP[catTitle.toLowerCase().trim()];
    if (key) counts[key] += pcb.quantity;
    for (const p of pcb.passengers ?? []) {
      const name = p.fullName || [p.firstName, p.lastName].filter(Boolean).join(" ");
      if (name) participantList.push({ name, category: catTitle });
    }
  }
  for (const ex of extras) {
    if (ex.extra.title.toLowerCase().includes("trailer")) counts.trailers += ex.quantity;
  }
  const meeting = pickupPlace?.title || pickupPlace?.address || startPoint?.title || startPoint?.address || "TBD";
  const customer = raw.customer ?? {};
  const customerName = customer.fullName || [customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Unknown";

  const bookingIdStr = String(raw.confirmationCode || raw.productConfirmationCode || raw.id || raw.bookingId || "");
  const channelRef = raw.externalBookingReference || null;
  const externalRef = raw.parentBookingId ? String(raw.parentBookingId) : null;

  const rateTitle = raw.rateTitle || raw.rate?.title || a0?.rateTitle || a0?.rate?.title || null;
  const seller = raw.seller?.title || raw.seller?.companyName || raw.sellerName || null;
  const channel = raw.bookingChannel?.title || raw.bookingChannel?.systemType || null;
  const created = raw.creationDate || raw.createdDate || null;

  return {
    source: "bokun" as const,
    booking_id: bookingIdStr,
    channel_booking_ref: channelRef,
    external_booking_ref: externalRef,
    tour_name: productTitle,
    date: startDateTime.slice(0, 10),
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
    rate: raw.totalPrice ?? raw.totalAsMoney?.amount ?? null,
    rate_title: rateTitle,
    seller,
    booking_channel: channel,
    bokun_created_at: created,
    ticket_sent: !!raw.ticketSent,
    notes: raw.notes ?? customer.notes ?? null,
    operations_notes: raw.internalNotes ?? null,
    required_tags: inferTags(productTitle, raw.productTags ?? raw.product?.tags),
  };
}

export async function runBokunImport(fromDate: string, toDate = "2099-12-31") {
  let page = 1;
  const pageSize = 50;
  let totalSeen = 0;
  let created = 0;
  const updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  while (true) {
    let searchRes: { results?: BokunBookingFull[]; totalHits?: number } | null = null;
    try {
      searchRes = await bokunFetch("POST", "/booking.json/booking-search", {
        bookingRole: "SELLER",
        startDateRange: { from: fromDate, to: toDate },
        pageSize,
        page,
        sortField: "startDate",
        sortOrder: "ASC",
      });
    } catch (e) {
      errors.push(`Search page ${page}: ${(e as Error).message}`);
      break;
    }

    const results = searchRes?.results ?? [];
    if (results.length === 0) break;

    for (const summary of results) {
      totalSeen++;
      const bid = summary.id ?? summary.bookingId;
      if (!bid) { skipped++; continue; }

      let full: BokunBookingFull;
      try {
        full = await bokunFetch("GET", `/booking.json/${bid}`);
      } catch (e) {
        errors.push(`Fetch ${bid}: ${(e as Error).message}`);
        skipped++;
        continue;
      }

      if ((full.status ?? "").toUpperCase() === "CANCELLED") { skipped++; continue; }

      const row = mapToShiftRow(full);
      if (!row || !row.booking_id) { skipped++; continue; }

      const { data: existing } = await supabaseAdmin
        .from("shifts")
        .select("id")
        .eq("source", "bokun")
        .eq("booking_id", row.booking_id)
        .maybeSingle();

      if (existing) {
        skipped++;
      } else {
        const { error } = await supabaseAdmin
          .from("shifts")
          .insert({ ...row, status: "unassigned" });
        if (error) errors.push(`Insert ${row.booking_id}: ${error.message}`);
        else created++;
      }
    }

    if (results.length < pageSize) break;
    page++;
    if (page > 200) break;
  }

  return { totalSeen, created, updated, skipped, errors: errors.slice(0, 20) };
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
