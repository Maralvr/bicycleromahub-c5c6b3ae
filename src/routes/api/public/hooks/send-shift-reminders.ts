import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/send-shift-reminders")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const cutoff = new Date(Date.now() - 60 * 1000).toISOString();

        const { data: sent, error } = await supabaseAdmin.rpc("send_shift_reminders" as never);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Find staff who just received a reminder so we can wake their devices.
        const { data: recents } = await supabaseAdmin
          .from("guide_notifications")
          .select("staff_id")
          .eq("type", "reminder")
          .gte("created_at", cutoff);

        const staffIds = Array.from(
          new Set((recents ?? []).map((r) => r.staff_id).filter((id): id is string => !!id)),
        );

        let pushSent = 0;
        let pushFailed = 0;
        let pushExpired = 0;
        if (staffIds.length > 0) {
          const { sendPushToStaffId } = await import("@/lib/push.server");
          const results = await Promise.all(staffIds.map((id) => sendPushToStaffId(id)));
          for (const r of results) {
            pushSent += r.sent;
            pushFailed += r.failed;
            pushExpired += r.expired;
          }
        }

        return Response.json({
          reminders: sent ?? 0,
          push: { sent: pushSent, failed: pushFailed, expired: pushExpired },
        });
      },
    },
  },
});
