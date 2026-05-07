import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

async function findMatchingShiftId(
  bookingId: string | null,
  email: string | null,
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

  // 2. Email fallback — match on customer_name? shifts table doesn't have customer_email yet.
  // Once email is added to shifts, swap this to .ilike on customer_email.
  // For now, no fallback possible without an email field. (Returns null.)
  if (email) {
    // Placeholder: future enhancement once shifts.customer_email exists.
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
        const matchedShiftId = await findMatchingShiftId(extracted.bookingId, extracted.email);

        const row = {
          external_signature_id: extracted.externalId,
          booking_id: extracted.bookingId,
          email: extracted.email,
          signer_name: extracted.signerName,
          signed_at: extracted.signedAt,
          waiver_template_id: extracted.waiverTemplateId,
          matched_shift_id: matchedShiftId,
          raw_payload: payload,
        };

        // Upsert on external_signature_id when present, otherwise insert.
        if (extracted.externalId) {
          const { error } = await supabaseAdmin
            .from("waiver_signatures")
            .upsert(row, { onConflict: "external_signature_id" });
          if (error) return jsonResponse({ error: error.message }, 500);
        } else {
          const { error } = await supabaseAdmin.from("waiver_signatures").insert(row);
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
