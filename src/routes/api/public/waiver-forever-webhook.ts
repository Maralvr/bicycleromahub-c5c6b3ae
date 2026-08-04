import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Waiverforever-Signature",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Verify WaiverForever's webhook signature.
 *
 * Per WaiverForever's official docs (docs.waiverforever.com), the header is
 * `X-Waiverforever-Signature: t=<unix_timestamp>,signature=<hex>`, and the
 * signature is a PLAIN SHA256 hash (not a keyed HMAC) of the comma-joined
 * string `"{timestamp},{raw_body},{app_secret}"`. The app_secret comes from
 * the Dashboard's Webhooks settings in app.waiverforever.com.
 */
function verifySignature(rawBody: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const idx = kv.indexOf("=");
      return idx === -1 ? [kv.trim(), ""] : [kv.slice(0, idx).trim(), kv.slice(idx + 1).trim()];
    }),
  );
  const t = parts["t"];
  const providedSig = parts["signature"];
  if (!t || !providedSig) return false;

  const signedPayload = `${t},${rawBody},${secret}`;
  const expected = createHash("sha256").update(signedPayload, "utf8").digest("hex");

  try {
    if (providedSig.length !== expected.length) return false;
    if (!timingSafeEqual(Buffer.from(providedSig), Buffer.from(expected))) return false;
  } catch {
    return false;
  }

  // Basic replay protection: reject signatures older/newer than 5 minutes.
  const tsSec = Number(t);
  if (Number.isFinite(tsSec)) {
    const ageMs = Date.now() - tsSec * 1000;
    if (Math.abs(ageMs) > 5 * 60 * 1000) return false;
  }

  return true;
}

type WaiverField = {
  id?: number | string;
  type?: string;
  title?: string;
  value?: unknown;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
};

type WaiverResource = {
  id?: string;
  status?: string; // "pending" | "approved" | "revoked"
  template_id?: string;
  signed_at?: number | string;
  received_at?: number | string;
  data?: WaiverField[];
  [key: string]: unknown;
};

/**
 * WaiverForever's real webhook envelope (confirmed against live deliveries) is:
 *   { type: "pdf_generated" | "new_waiver_submitted" | ...,
 *     content_type: "waiver",
 *     content: { ...Waiver resource... } }
 *
 * Older/other shapes we still tolerate: `{ event, data }` and a bare Waiver
 * resource posted unwrapped at the top level.
 */
function unwrapEvent(payload: Record<string, unknown>): {
  eventName: string | null;
  waiver: WaiverResource;
} {
  const eventName =
    typeof payload.type === "string"
      ? payload.type
      : typeof payload.event === "string"
        ? payload.event
        : null;

  const looksLikeWaiver = (v: unknown): v is WaiverResource =>
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    "id" in (v as object) &&
    "data" in (v as object);

  if (looksLikeWaiver(payload.content)) {
    return { eventName, waiver: payload.content };
  }
  if (looksLikeWaiver(payload.data)) {
    return { eventName, waiver: payload.data };
  }
  return { eventName, waiver: payload as WaiverResource };
}


function unixToIso(value: unknown): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

function nameFieldToString(f: WaiverField): string {
  if (typeof f.value === "string" && f.value.trim()) return f.value.trim();
  return [f.first_name, f.middle_name, f.last_name].filter(Boolean).join(" ").trim();
}

/**
 * Extract our matching keys from a real WaiverForever "Waiver" resource.
 * Customer-entered data lives in `data`, an array of typed field objects
 * (`type: "name_field" | "email_field" | "phone_field" | ...`), each with a
 * template-customizable `title` (question text) — NOT a stable custom-field
 * key. There is no dedicated "booking reference" field type; we only pick one
 * up if the template happens to include a short-answer/single-choice field
 * whose title mentions booking/confirmation/reservation.
 */
function extractFromWaiver(waiver: WaiverResource) {
  const fields: WaiverField[] = Array.isArray(waiver.data) ? waiver.data : [];

  const emailField = fields.find((f) => f?.type === "email_field");
  const nameField = fields.find((f) => f?.type === "name_field");
  const bookingField = fields.find(
    (f) =>
      (f?.type === "short_answer_field" || f?.type === "single_choice_field") &&
      typeof f.title === "string" &&
      /(booking|confirmation|reservation)/i.test(f.title),
  );

  const email =
    emailField && typeof emailField.value === "string"
      ? emailField.value.toLowerCase().trim()
      : null;
  const signerName = nameField ? nameFieldToString(nameField) || null : null;
  const bookingId =
    bookingField && bookingField.value != null ? String(bookingField.value).trim() || null : null;

  const signedAt = unixToIso(waiver.signed_at) ?? unixToIso(waiver.received_at);
  const waiverTemplateId = waiver.template_id ? String(waiver.template_id) : null;
  const externalId = waiver.id ? String(waiver.id) : null;
  const status = typeof waiver.status === "string" ? waiver.status : null;

  return { bookingId, email, signerName, signedAt, waiverTemplateId, externalId, status };
}

/** Normalize a person name for fuzzy comparison: lowercase, strip accents/punct, sort tokens. */
function normalizeName(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

/** Two names "match" if one normalized token set is contained in the other (handles middle names, order). */
function namesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const ta = new Set(a.split(" "));
  const tb = new Set(b.split(" "));
  // require at least 2 shared tokens (first + last) OR full containment
  const shared = [...ta].filter((t) => tb.has(t)).length;
  return shared >= 2;
}

type ShiftMatchRow = {
  id: string;
  date: string;
  customer_name?: string | null;
};

async function findMatchingShiftId(
  supabaseAdmin: any,
  bookingId: string | null,
  email: string | null,
  signerName: string | null,
  signedAt: string,
): Promise<string | null> {
  // 1. Booking ID match (strongest)
  if (bookingId) {
    const { data } = await supabaseAdmin
      .from("shifts")
      .select("id")
      .eq("booking_id", bookingId)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  // 2. Email match (exact, case-insensitive) — restrict to a ±14 day window around signing.
  const signedDate = new Date(signedAt);
  const windowFrom = new Date(signedDate.getTime() - 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const windowTo = new Date(signedDate.getTime() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  if (email) {
    const { data } = await supabaseAdmin
      .from("shifts")
      .select("id, date")
      .ilike("customer_email", email)
      .gte("date", windowFrom)
      .lte("date", windowTo)
      .order("date", { ascending: true });
    if (data && data.length > 0) {
      // Prefer the shift closest to signedAt
      const best = (data as ShiftMatchRow[]).reduce((a, b) =>
        Math.abs(new Date(a.date).getTime() - signedDate.getTime()) <=
        Math.abs(new Date(b.date).getTime() - signedDate.getTime())
          ? a
          : b,
      );
      return best.id;
    }
  }

  // 3. Name match — main booker's name vs shift.customer_name, within ±14 days.
  if (signerName) {
    const normalizedSigner = normalizeName(signerName);
    if (normalizedSigner) {
      const { data } = await supabaseAdmin
        .from("shifts")
        .select("id, date, customer_name")
        .not("customer_name", "is", null)
        .gte("date", windowFrom)
        .lte("date", windowTo);
      const candidates = ((data ?? []) as ShiftMatchRow[]).filter((s) =>
        namesMatch(normalizedSigner, normalizeName(s.customer_name)),
      );
      if (candidates.length === 1) return candidates[0].id;
      if (candidates.length > 1) {
        // Multiple matches — pick the one closest in time to signedAt
        const best = candidates.reduce((a, b) =>
          Math.abs(new Date(a.date).getTime() - signedDate.getTime()) <=
          Math.abs(new Date(b.date).getTime() - signedDate.getTime())
            ? a
            : b,
        );
        return best.id;
      }
    }
  }

  return null;
}

export const Route = createFileRoute("/api/public/waiver-forever-webhook")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      GET: async () => jsonResponse({ ok: true, name: "waiver-forever-webhook", method: "POST" }),

      POST: async ({ request }) => {
        const rawBody = await request.text();

        // Signature verification — only enforced if WAIVER_FOREVER_WEBHOOK_SECRET is set.
        // WaiverForever issues a distinct `secret_key` per webhook subscription, so the
        // env var may hold a comma-separated list of secrets (one per subscription).
        // See verifySignature() for WaiverForever's actual (non-HMAC) scheme.
        const secrets = (process.env.WAIVER_FOREVER_WEBHOOK_SECRET || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (secrets.length > 0) {
          const sigHeader = request.headers.get("x-waiverforever-signature") || "";
          const ok = !!sigHeader && secrets.some((s) => verifySignature(rawBody, sigHeader, s));
          if (!ok) {
            return jsonResponse({ error: "Invalid signature" }, 401);
          }
        }


        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return jsonResponse({ error: "Invalid JSON" }, 400);
        }

        const { eventName, waiver } = unwrapEvent(payload);
        const extracted = extractFromWaiver(waiver);

        // Persist on signature events. `new_waiver_submitted` fires the moment
        // the customer signs; `pdf_generated` (equal to the deprecated
        // `new_waiver_signed`) fires later once the PDF is rendered. We accept
        // both — rows are upserted on `external_signature_id`, so the later
        // event just refreshes the same row. `waiver_checkin` is not a
        // signature event. If we can't read an `event` name off the body (e.g.
        // the Waiver resource was posted unwrapped), fall back to the
        // resource's own `status` field, which is `"approved"` once signed.
        const SIGNED_EVENTS = new Set([
          "pdf_generated",
          "new_waiver_signed",
          "new_waiver_submitted",
          "new_waiver_accepted",
        ]);
        const isSignedEvent = eventName
          ? SIGNED_EVENTS.has(eventName)
          : extracted.status === "approved";

        if (!isSignedEvent) {
          return jsonResponse({
            ok: true,
            skipped: true,
            event: eventName,
            status: extracted.status,
          });
        }

        if (!extracted.signedAt) {
          return jsonResponse({ error: "Missing/invalid signed_at in payload" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const matchedShiftId = await findMatchingShiftId(
          supabaseAdmin,
          extracted.bookingId,
          extracted.email,
          extracted.signerName,
          extracted.signedAt,
        );

        const row = {
          external_signature_id: extracted.externalId,
          booking_id: extracted.bookingId,
          email: extracted.email,
          signer_name: extracted.signerName,
          signed_at: extracted.signedAt,
          waiver_template_id: extracted.waiverTemplateId,
          matched_shift_id: matchedShiftId,
          raw_payload: payload as never,
        };

        // Upsert on external_signature_id when present, otherwise insert.
        if (extracted.externalId) {
          const { error } = await supabaseAdmin
            .from("waiver_signatures")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .upsert(row as any, { onConflict: "external_signature_id" });
          if (error) return jsonResponse({ error: error.message }, 500);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await supabaseAdmin.from("waiver_signatures").insert(row as any);
          if (error) return jsonResponse({ error: error.message }, 500);
        }

        return jsonResponse({
          ok: true,
          matched: !!matchedShiftId,
          shift_id: matchedShiftId,
          booking_id: extracted.bookingId,
        });
      },
    },
  },
});
