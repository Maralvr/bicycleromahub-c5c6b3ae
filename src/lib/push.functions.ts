import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
};

export const registerPushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SubscriptionInput) => {
    if (!input || typeof input.endpoint !== "string" || !input.endpoint.startsWith("http")) {
      throw new Error("Invalid push subscription: bad endpoint");
    }
    if (typeof input.p256dh !== "string" || typeof input.auth !== "string") {
      throw new Error("Invalid push subscription: missing keys");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Find this user's staff_id (for routing pushes by staff).
    const { data: staffRow } = await supabase
      .from("staff")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle();

    const row = {
      profile_id: userId,
      staff_id: staffRow?.id ?? null,
      endpoint: data.endpoint,
      p256dh: data.p256dh,
      auth: data.auth,
      user_agent: data.userAgent ?? null,
      last_used_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(row, { onConflict: "endpoint" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unregisterPushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { endpoint: string }) => {
    if (!input?.endpoint) throw new Error("endpoint required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint)
      .eq("profile_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: staffRow } = await supabase
      .from("staff")
      .select("id, name")
      .eq("profile_id", userId)
      .maybeSingle();
    if (!staffRow) throw new Error("No staff record found for this user");
    const { sendPushToStaffId } = await import("@/lib/push.server");
    const result = await sendPushToStaffId(staffRow.id);
    return result;
  });

export const sendPushForNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { staffIds: string[]; title?: string; body?: string; url?: string }) => {
    if (!Array.isArray(input?.staffIds)) throw new Error("staffIds[] required");
    return input;
  })
  .handler(async ({ data }) => {
    const { sendPushToStaffId } = await import("@/lib/push.server");
    const results = await Promise.all(data.staffIds.map((id) => sendPushToStaffId(id)));
    return {
      sent: results.reduce((s, r) => s + r.sent, 0),
      failed: results.reduce((s, r) => s + r.failed, 0),
      expired: results.reduce((s, r) => s + r.expired, 0),
    };
  });
