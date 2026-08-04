// Supabase Edge Function: bokun-webhook
// Public endpoint Bokun POSTs booking events to.
// Inserts/updates rows in public.shifts via service role.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Bokun-Signature, X-Webhook-Signature, X-Webhook-Secret, X-Bokun-ApiKey, X-Bokun-Hmac, X-Bokun-Topic, X-Bokun-Vendor-Id, X-Bokun-Booking-Id, Authorization",
};

const PRICING_MAP: Record<string, "adults" | "teens" | "infants"> = {
  adult: "adults", adults: "adults",
  teen: "teens", teenager: "teens", teens: "teens", child: "teens", children: "teens",
  infant: "infants", infants: "infants", baby: "infants",
};

function inferTags(title: string, productTags?: string[]) {
  const tags = new Set<string>(productTags?.map((t) => t.toLowerCase()) ?? []);
  const t = title.toLowerCase();
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

interface BokunEventPayload {
  bookingId: string | number;
  timestamp?: string;
  experienceBookingId?: string;
}

interface FullBookingPayload extends BokunEventPayload {
  parentBookingId?: string | number;
  confirmationCode?: string;
  productTitle: string;
  startDateTime: string;
  endDateTime?: string;
  durationMinutes?: number;
  pickupPlace?: BokunPlace;
  startPoint?: BokunPlace;
  customer: {
    firstName?: string;
    lastName?: string;
    fullName?: string;
    phoneNumber?: string;
    email?: string;
  };
  pricingCategoryBookings?: Array<{ pricingCategory: { title: string }; quantity: number }>;
  extraBookings?: Array<{ extra: { title: string }; quantity: number }>;
  totalPrice?: number;
  currency?: string;
  notes?: string;
  productTags?: string[];
  // Bokun's booked *rate* (pricing option) -- "Public tour in English",
  // "Regular Bike (City or Mtb) 2-hour" -- distinct from `totalPrice`.
  rateTitle?: string;
  // Locale-stable id of that rate, plus the product it belongs to: together
  // they resolve the canonical English title from bokun_product_rates.
  rateId?: string;
  bokunProductId?: string;
  status?: "CONFIRMED" | "CANCELLED" | "PENDING";
}


interface BokunPlace {
  title?: string;
  address?: string | {
    addressLine1?: string;
    addressLine2?: string | null;
    city?: string;
    postalCode?: string;
  };
}

function addressText(address: BokunPlace["address"]): string | undefined {
  if (!address) return undefined;
  if (typeof address === "string") return address.trim() || undefined;
  return (
    [address.addressLine1, address.addressLine2, address.city]
      .filter((part) => Boolean(part && String(part).trim()))
      .join(", ") || undefined
  );
}

function placeText(place?: BokunPlace | null): string | undefined {
  if (!place) return undefined;
  return [place.title, addressText(place.address)].filter(Boolean).join(" \u2014 ") || undefined;
}

/**
 * The booked meeting point lives on the activity booking's product as
 * `activity.startPoints[]` (verified on parent bookings 99421117 / 99186399 /
 * 98600858 / 99224013), selected by the booking's `startPointId`. Top-level
 * `pickupPlace` / `startPoint` are usually absent, which is why webhook rows
 * used to land on "TBD". Keep in sync with mapToShiftRow in
 * src/lib/bokun-import.server.ts.
 */
// deno-lint-ignore no-explicit-any
function extractStartPoint(raw: any): BokunPlace | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const a0 = raw.activityBookings?.[0];
  const direct = raw.startPoint ?? a0?.startPoint;
  if (direct) return direct as BokunPlace;
  const points = raw.activity?.startPoints ?? a0?.activity?.startPoints ?? raw.product?.startPoints ?? [];
  if (points.length === 0) return undefined;
  const wantedId = raw.startPointId ?? a0?.startPointId;
  if (wantedId != null) {
    // deno-lint-ignore no-explicit-any
    const match = points.find((sp: any) => String(sp?.id ?? "") === String(wantedId));
    if (match) return match as BokunPlace;
  }
  return points[0] as BokunPlace;
}

/**
 * Where the booked rate actually lives in Bokun payloads (verified against
 * parent bookings 98672696 / 99370402): on the activity booking as
 * `rateTitle`, with a numeric `rateId` that maps into
 * `activity.rates[] -> { title, rateCode }`. It's also mirrored under the
 * invoice product. Keep this in sync with mapToShiftRow in
 * src/lib/bokun-import.server.ts -- these two mappers are hand-ported
 * duplicates.
 */
// deno-lint-ignore no-explicit-any
function extractRateTitle(raw: any): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const a0 = raw.activityBookings?.[0];
  const fromRates = (() => {
    const rateId = raw.rateId ?? a0?.rateId;
    if (rateId == null) return undefined;
    const rates = raw.activity?.rates ?? a0?.activity?.rates ?? [];
    // deno-lint-ignore no-explicit-any
    return rates.find((r: any) => String(r?.id) === String(rateId))?.title;
  })();
  return (
    raw.rateTitle ??
    raw.rate?.title ??
    raw.invoice?.product?.rateTitle ??
    raw.invoice?.productInvoices?.[0]?.product?.rateTitle ??
    a0?.rateTitle ??
    a0?.rate?.title ??
    a0?.invoice?.product?.rateTitle ??
    fromRates ??
    undefined
  );
}


function validate(input: unknown): { ok: true; data: BokunEventPayload } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Body must be an object" };
  const p = input as Record<string, unknown>;
  if (!p.bookingId || (typeof p.bookingId !== "string" && typeof p.bookingId !== "number")) {
    return { ok: false, error: "bookingId required" };
  }
  return { ok: true, data: input as BokunEventPayload };
}

function hasFullBookingDetails(p: BokunEventPayload): p is FullBookingPayload {
  const c = p as Record<string, unknown>;
  // Accept either our schema (productTitle) OR Bokun's native webhook shape (title + startDateTime)
  const hasTitle = typeof c.productTitle === "string" || typeof c.title === "string";
  const hasStart = c.startDateTime !== undefined && c.startDateTime !== null;
  return hasTitle && hasStart;
}

function toIsoDateTime(v: unknown): string {
  if (typeof v === "number") return new Date(v).toISOString();
  if (typeof v === "string") {
    // numeric string (epoch ms)
    if (/^\d+$/.test(v)) return new Date(Number(v)).toISOString();
    return new Date(v).toISOString();
  }
  return new Date().toISOString();
}

function normalizeWebhookPayload(raw: any): FullBookingPayload {
  // Bokun's webhook delivers an activity-booking-like shape.
  // Map its native fields to our FullBookingPayload schema.
  const customer = raw.customer ?? raw.parentBooking?.customer ?? {};
  const fields = raw.fields ?? raw.parentBooking?.fields ?? {};
  return {
    bookingId: raw.bookingId ?? raw.id,
    parentBookingId: raw.parentBookingId ?? raw.parentBooking?.id,
    confirmationCode: raw.productConfirmationCode ?? raw.confirmationCode,
    productTitle: raw.productTitle ?? raw.title ?? raw.product?.title ?? "Bokun booking",
    startDateTime: toIsoDateTime(raw.startDateTime ?? raw.startDate),
    endDateTime: raw.endDateTime ? toIsoDateTime(raw.endDateTime) : undefined,
    durationMinutes: raw.durationMinutes ?? raw.product?.durationMinutes,
    pickupPlace: raw.pickupPlace,
    startPoint: extractStartPoint(raw),
    customer: {
      firstName: customer.firstName ?? fields.firstName,
      lastName: customer.lastName ?? fields.lastName,
      fullName: customer.fullName ?? fields.fullName,
      phoneNumber: customer.phoneNumber ?? customer.phone ?? fields.phoneNumber,
      email: customer.email ?? fields.email,
    },
    pricingCategoryBookings: raw.pricingCategoryBookings,
    extraBookings: raw.extraBookings,
    totalPrice: raw.totalPrice,
    currency: raw.currency ?? raw.product?.vendor?.currencyCode,
    notes: raw.notes ?? customer.notes,
    productTags: raw.productTags ?? raw.product?.tags,
    rateTitle: extractRateTitle(raw),
    status: raw.status,
  };
}

function bookingKeys(p: BokunEventPayload) {
  const raw = String(p.bookingId);
  const keys = new Set([raw]);
  const c = p as Record<string, unknown>;
  const confirmationCode = c.confirmationCode as string | undefined;
  const productConfirmationCode = c.productConfirmationCode as string | undefined;
  if (confirmationCode) keys.add(confirmationCode);
  if (productConfirmationCode) keys.add(productConfirmationCode);
  if (!raw.startsWith("BKN-")) keys.add(`BKN-${raw}`);
  return Array.from(keys);
}


async function signedFetch(path: string, accessKey: string, secretKey: string) {
  const method = "GET";
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
  const stringToSign = `${date}${accessKey}${method}${path}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secretKey), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(stringToSign));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
  return fetch(`https://api.bokun.io${path}`, {
    method,
    headers: {
      "X-Bokun-Date": date,
      "X-Bokun-AccessKey": accessKey,
      "X-Bokun-Signature": signature,
      "Content-Type": "application/json;charset=UTF-8",
    },
  });
}

async function fetchBokunBooking(bookingId: string | number): Promise<FullBookingPayload | null> {
  // @ts-ignore Deno globals
  const accessKey = Deno.env.get("BOKUN_ACCESS_KEY");
  // @ts-ignore Deno globals
  const secretKey = Deno.env.get("BOKUN_SECRET_KEY");
  if (!accessKey || !secretKey) {
    console.warn("[bokun] Missing BOKUN_ACCESS_KEY / BOKUN_SECRET_KEY — cannot fetch booking", bookingId);
    return null;
  }

  // Try parent booking first, then activity-booking (experience booking IDs)
  const paths = [`/booking.json/${bookingId}`, `/activity-booking.json/${bookingId}`];
  let raw: any = null;
  for (const path of paths) {
    const res = await signedFetch(path, accessKey, secretKey);
    if (res.ok) {
      raw = await res.json();
      console.log(`[bokun] Fetched ${path}`);
      break;
    }
    const text = await res.text();
    console.warn(`[bokun] ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!raw) {
    console.error(`[bokun] All endpoints failed for booking ${bookingId}`);
    return null;
  }

  // If activity-booking returned a parentBookingId, fetch the full parent for richer data
  if (raw.parentBookingId && !raw.customer) {
    const parentRes = await signedFetch(`/booking.json/${raw.parentBookingId}`, accessKey, secretKey);
    if (parentRes.ok) {
      const parent = await parentRes.json();
      raw = { ...raw, ...parent };
    }
  }

  // Normalize Bokun API response to our FullBookingPayload shape
  return {
    bookingId: raw.id ?? raw.bookingId ?? bookingId,
    // Only a real parent id -- raw.id may be an activity-booking id here,
    // and external_booking_ref must always be the parent booking id.
    parentBookingId: raw.parentBookingId ?? raw.parentBooking?.id,
    confirmationCode: raw.confirmationCode,
    productTitle: raw.product?.title ?? raw.productTitle ?? raw.activityBookings?.[0]?.activity?.title ?? "Bokun booking",
    startDateTime: raw.startDateTime ?? raw.startDate ?? raw.activityBookings?.[0]?.startDateTime ?? new Date().toISOString(),
    endDateTime: raw.endDateTime ?? raw.activityBookings?.[0]?.endDateTime,
    durationMinutes: raw.durationMinutes ?? raw.activityBookings?.[0]?.activity?.durationMinutes,
    pickupPlace: raw.pickupPlace ?? raw.activityBookings?.[0]?.pickupPlace,
    startPoint: extractStartPoint(raw),
    customer: raw.customer ?? {},
    pricingCategoryBookings: raw.pricingCategoryBookings ?? raw.activityBookings?.[0]?.pricingCategoryBookings,
    extraBookings: raw.extraBookings ?? raw.activityBookings?.[0]?.extraBookings,
    totalPrice: raw.totalPrice ?? raw.totalAsMoney?.amount,
    currency: raw.currency ?? raw.totalAsMoney?.currency,
    notes: raw.notes ?? raw.customer?.notes,
    productTags: raw.productTags ?? raw.product?.tags,
    rateTitle: extractRateTitle(raw),
    status: raw.status,
  } as FullBookingPayload;
}

function mapToShiftRow(p: FullBookingPayload) {
  const participants = { adults: 0, teens: 0, infants: 0, trailers: 0 };
  for (const pcb of p.pricingCategoryBookings ?? []) {
    const key = PRICING_MAP[pcb.pricingCategory.title.toLowerCase().trim()];
    if (key) participants[key] += pcb.quantity;
  }
  for (const ex of p.extraBookings ?? []) {
    if (ex.extra.title.toLowerCase().includes("trailer")) participants.trailers += ex.quantity;
  }
  const meeting = placeText(p.pickupPlace) ?? placeText(p.startPoint) ?? "TBD";
  const customerName = p.customer.fullName || [p.customer.firstName, p.customer.lastName].filter(Boolean).join(" ") || "Unknown";
  return {
    source: "bokun" as const,
    booking_id: p.confirmationCode || String(p.bookingId),
    // Parent booking id -- required later by healStuckZeroParticipantBookings
    // to re-fetch booking detail. Never leave this unset on a create.
    external_booking_ref: p.parentBookingId ? String(p.parentBookingId) : null,
    tour_name: p.productTitle,
    date: p.startDateTime.slice(0, 10),
    start_time: fmtTime(p.startDateTime),
    end_time: computeEnd(p.startDateTime, p.endDateTime, p.durationMinutes),
    meeting_point: meeting,
    customer_name: customerName,
    customer_phone: p.customer.phoneNumber || null,
    adults: participants.adults,
    teens: participants.teens,
    infants: participants.infants,
    trailers: participants.trailers,
    rate: p.totalPrice ?? null,
    rate_title: p.rateTitle ?? null,
    notes: p.notes ?? null,
    required_tags: inferTags(p.productTitle, p.productTags),
    status: "unassigned" as const,
  };
}

// @ts-ignore Deno globals
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ ok: true, name: "bokun-webhook", method: "POST" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  // Shared-secret authentication — only enforced if BOKUN_WEBHOOK_SECRET is set.
  // When unset, the endpoint accepts all requests (fails open).
  // @ts-ignore Deno globals
  const expectedSecret = Deno.env.get("BOKUN_WEBHOOK_SECRET");
  if (expectedSecret) {
    const headerSecret = req.headers.get("x-webhook-secret") ?? "";
    const url = new URL(req.url);
    const querySecret = url.searchParams.get("token") ?? "";
    const provided = headerSecret || querySecret;
    // constant-time compare
    let ok = provided.length === expectedSecret.length;
    for (let i = 0; i < Math.max(provided.length, expectedSecret.length); i++) {
      ok = ok && provided.charCodeAt(i) === expectedSecret.charCodeAt(i);
    }
    if (!ok) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("[bokun] Incoming payload:", JSON.stringify(body).slice(0, 2000));



  const v = validate(body);
  if (!v.ok) {
    return new Response(JSON.stringify({ error: v.error }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const topic = req.headers.get("x-bokun-topic") ?? "";
  const keys = bookingKeys(v.data);

  // @ts-ignore Deno globals
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  // @ts-ignore Deno globals
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: existing } = await supabase
    .from("shifts")
    .select("id, adults, teens, infants, trailers, external_booking_ref, rate_title, meeting_point")
    .eq("source", "bokun")
    .in("booking_id", keys)
    .maybeSingle();

  if (topic === "bookings/cancel" || (hasFullBookingDetails(v.data) && v.data.status === "CANCELLED")) {
    if (existing) {
      await supabase.from("shifts").delete().eq("id", existing.id);
      return new Response(JSON.stringify({ ok: true, action: "cancelled", id: existing.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, action: "noop" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Bokun's webhook (and Make.com bridge) sends the full booking payload.
  // Normalize it directly — only fall back to API if even basic fields are missing.
  let fullPayload: FullBookingPayload | null = hasFullBookingDetails(v.data)
    ? normalizeWebhookPayload(v.data)
    : null;
  if (!fullPayload) {
    fullPayload = await fetchBokunBooking(v.data.bookingId);
    if (!fullPayload) {
      return new Response(JSON.stringify({
        ok: false,
        action: "fetch_failed",
        bookingId: String(v.data.bookingId),
        hint: "Webhook payload missing fields and Bokun API fetch failed.",
      }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Re-check cancel status now that we have full details
    if (fullPayload.status === "CANCELLED" && existing) {
      await supabase.from("shifts").delete().eq("id", existing.id);
      return new Response(JSON.stringify({ ok: true, action: "cancelled", id: existing.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const row = mapToShiftRow(fullPayload);

  if (existing) {
    const updates: Record<string, unknown> = { ...row };

    // Never null out a parent ref that was already resolved.
    if (updates.external_booking_ref == null && existing.external_booking_ref) {
      delete updates.external_booking_ref;
    }

    // rate_title is fill-only: admins can override it in the app, and a
    // webhook push must never clobber that (or blank it out when Bokun's
    // payload happens not to carry the rate).
    if (updates.rate_title == null || existing.rate_title) {
      delete updates.rate_title;
    }

    // meeting_point is fill-only too. "TBD" is the placeholder for "no start
    // point in the payload", so never write it over a stored value, and never
    // overwrite a real meeting point an admin corrected by hand.
    if (
      updates.meeting_point == null ||
      updates.meeting_point === "TBD" ||
      (existing.meeting_point && existing.meeting_point !== "TBD")
    ) {
      delete updates.meeting_point;
    }


    // Zero-participant guard (ported from bokun-import.server.ts).
    // A payload without pricingCategoryBookings maps to 0/0/0. Writing that
    // over a row that already holds real counts destroys good data, so:
    // try the Bokun detail API first, and if that still yields 0, leave the
    // existing participant fields untouched for heal-bokun-zeros to pick up.
    const incomingTotal = row.adults + row.teens + row.infants;
    const existingTotal =
      (existing.adults ?? 0) + (existing.teens ?? 0) + (existing.infants ?? 0);

    if (incomingTotal === 0 && existingTotal > 0) {
      const detail = await fetchBokunBooking(fullPayload.bookingId);
      const detailRow = detail ? mapToShiftRow(detail) : null;
      const detailTotal = detailRow
        ? detailRow.adults + detailRow.teens + detailRow.infants
        : 0;

      if (detailRow && detailTotal > 0) {
        updates.adults = detailRow.adults;
        updates.teens = detailRow.teens;
        updates.infants = detailRow.infants;
        updates.trailers = detailRow.trailers;
        if (detailRow.external_booking_ref) {
          updates.external_booking_ref = detailRow.external_booking_ref;
        }
        console.log(
          `[bokun] Recovered participants from detail API for ${row.booking_id}: ${detailTotal}`,
        );
      } else {
        delete updates.adults;
        delete updates.teens;
        delete updates.infants;
        delete updates.trailers;
        console.warn(
          `[bokun] Refusing to zero participants for ${row.booking_id} ` +
            `(existing=${existingTotal}, payload=0, detail fetch inconclusive). ` +
            `Left for heal-bokun-zeros.`,
        );
      }
    }

    const { error } = await supabase.from("shifts").update(updates).eq("id", existing.id);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, action: "updated", id: existing.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: created, error } = await supabase.from("shifts").insert(row).select("id").single();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true, action: "created", id: created.id }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
