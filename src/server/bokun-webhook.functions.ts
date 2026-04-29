import { createServerFn } from "@tanstack/react-start";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PayloadSchema = z.object({
  bookingId: z.union([z.string(), z.number()]),
  confirmationCode: z.string().max(64).optional(),
  productTitle: z.string().min(1).max(255),
  startDateTime: z.string().min(1).max(64),
  endDateTime: z.string().max(64).optional(),
  durationMinutes: z.number().int().min(1).max(60 * 24).optional(),
  pickupPlace: z.object({ title: z.string().max(255).optional(), address: z.string().max(500).optional() }).optional(),
  startPoint: z.object({ title: z.string().max(255).optional(), address: z.string().max(500).optional() }).optional(),
  customer: z.object({
    firstName: z.string().max(120).optional(),
    lastName: z.string().max(120).optional(),
    fullName: z.string().max(240).optional(),
    phoneNumber: z.string().max(40).optional(),
    email: z.string().email().max(254).optional(),
  }),
  pricingCategoryBookings: z.array(z.object({ pricingCategory: z.object({ title: z.string().max(80) }), quantity: z.number().int().min(0).max(500) })).max(20).optional(),
  extraBookings: z.array(z.object({ extra: z.object({ title: z.string().max(120) }), quantity: z.number().int().min(0).max(500) })).max(20).optional(),
  totalPrice: z.number().min(0).max(1_000_000).optional(),
  currency: z.string().max(8).optional(),
  notes: z.string().max(2000).optional(),
  productTags: z.array(z.string().max(80)).max(50).optional(),
  signature: z.string().max(256).optional(),
});

type Payload = z.infer<typeof PayloadSchema>;

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

function mapToShiftRow(p: Payload) {
  const participants = { adults: 0, teens: 0, infants: 0, trailers: 0 };
  for (const pcb of p.pricingCategoryBookings ?? []) {
    const key = PRICING_MAP[pcb.pricingCategory.title.toLowerCase().trim()];
    if (key) participants[key] += pcb.quantity;
  }
  for (const ex of p.extraBookings ?? []) {
    if (ex.extra.title.toLowerCase().includes("trailer")) participants.trailers += ex.quantity;
  }
  const meeting = p.pickupPlace?.title || p.pickupPlace?.address || p.startPoint?.title || p.startPoint?.address || "TBD";
  const customerName = p.customer.fullName || [p.customer.firstName, p.customer.lastName].filter(Boolean).join(" ") || "Unknown";
  return {
    source: "bokun" as const,
    booking_id: p.confirmationCode || `BKN-${p.bookingId}`,
    tour_name: p.productTitle,
    date: p.startDateTime.slice(0, 10),
    start_time: fmtTime(p.startDateTime),
    end_time: computeEnd(p.startDateTime, p.endDateTime, p.durationMinutes),
    meeting_point: meeting,
    customer_name: customerName,
    customer_phone: p.customer.phoneNumber || null,
    participants_adults: participants.adults,
    participants_teens: participants.teens,
    participants_infants: participants.infants,
    participants_trailers: participants.trailers,
    rate: p.totalPrice ?? null,
    notes: p.notes ?? null,
    required_tags: inferTags(p.productTitle, p.productTags),
    status: "unassigned" as const,
  };
}

export const bokunWebhook = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const parsed = PayloadSchema.safeParse(input);
    if (!parsed.success) throw new Error("Invalid payload");
    return parsed.data;
  })
  .handler(async ({ data }) => {
    const secret = process.env.BOKUN_WEBHOOK_SECRET;
    if (secret) {
      if (!data.signature) throw new Error("Missing signature");
      const { signature: _sig, ...rest } = data;
      const expected = createHmac("sha256", secret).update(JSON.stringify(rest)).digest("hex");
      try {
        const a = Buffer.from(data.signature, "hex");
        const b = Buffer.from(expected, "hex");
        if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Invalid signature");
      } catch {
        throw new Error("Invalid signature");
      }
    }

    const row = mapToShiftRow(data);

    const { data: existing } = await supabaseAdmin
      .from("shifts")
      .select("id")
      .eq("source", "bokun")
      .eq("booking_id", row.booking_id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabaseAdmin.from("shifts").update(row).eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { ok: true, action: "updated" as const, id: existing.id };
    }

    const { data: created, error } = await supabaseAdmin.from("shifts").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, action: "created" as const, id: created.id };
  });
