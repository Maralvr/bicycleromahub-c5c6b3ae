import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Waiver-Signature",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Try to extract our matching keys from a Waiver Forever payload.
 * The exact field names will be confirmed once we have access to a real payload —
 * for now we look in several plausible places (custom fields, top-level, signer block).
 */
function extractFromPayload(payload: Record<string, unknown>) {
  const p = payload as any;

  // Custom fields on Waiver Forever templates can show up as an array of {label/name/key, value}
  // or as a flat object. We probe common shapes.
  const customFields: Array<{ key?: string; label?: string; name?: string; value?: unknown }> =
    p.custom_fields || p.customFields || p.fields || [];

  const fieldByName = (needle: string): string | null => {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const target = norm(needle);
    for (const f of customFields) {
      const k = f.key || f.label || f.name;
      if (k && norm(String(k)).includes(target) && f.value != null) return String(f.value);
    }
    return null;
  };

  const bookingId =
    fieldByName("booking") ||
    fieldByName("confirmation") ||
    p.booking_id ||
    p.bookingId ||
    p.bokun_booking_id ||
    null;

  const email =
    p.signer_email ||
    p.email ||
    p.signer?.email ||
    fieldByName("email") ||
    null;

  const signerName =
    p.signer_name ||
    p.signer?.name ||
    [p.signer?.firstName, p.signer?.lastName].filter(Boolean).join(" ") ||
    p.name ||
    null;

  const signedAt =
    p.signed_at || p.signedAt || p.completed_at || p.timestamp || new Date().toISOString();

  const waiverTemplateId =
    p.template_id || p.templateId || p.waiver_id || p.waiverId || null;

  const externalId =
    p.signature_id || p.signatureId || p.id || p.event_id || null;

  return {
    bookingId: bookingId ? String(bookingId) : null,
    email: email ? String(email).toLowerCase().trim() : null,
    signerName: signerName ? String(signerName) : null,
    signedAt: String(signedAt),
    waiverTemplateId: waiverTemplateId ? String(waiverTemplateId) : null,
    externalId: externalId ? String(externalId) : null,
  };
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
      const best = data.reduce((a, b) =>
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
      const candidates = (data ?? []).filter((s) =>
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

      GET: async () =>
        jsonResponse({ ok: true, name: "waiver-forever-webhook", method: "POST" }),

      POST: async ({ request }) => {
        const rawBody = await request.text();

        // Optional HMAC verification — only enforced if WAIVER_FOREVER_WEBHOOK_SECRET is set.
        const secret = process.env.WAIVER_FOREVER_WEBHOOK_SECRET;
        if (secret) {
          const provided = request.headers.get("x-waiver-signature") || "";
          const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
          try {
            const ok =
              provided.length === expected.length &&
              timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
            if (!ok) return jsonResponse({ error: "Invalid signature" }, 401);
          } catch {
            return jsonResponse({ error: "Invalid signature" }, 401);
          }
        }

        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return jsonResponse({ error: "Invalid JSON" }, 400);
        }

        const extracted = extractFromPayload(payload);
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
