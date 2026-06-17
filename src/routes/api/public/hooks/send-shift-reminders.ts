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

        const { data: rentalSent } = await supabaseAdmin.rpc(
          "send_rental_point_reminders" as never,
        );

        // Wake guides
        const { data: recents } = await supabaseAdmin
          .from("guide_notifications")
          .select("staff_id")
          .eq("type", "reminder")
          .gte("created_at", cutoff);

        const staffIds = Array.from(
          new Set((recents ?? []).map((r) => r.staff_id).filter((id): id is string => !!id)),
        );

        // Wake rental staff
        const { data: rentalRecents } = await supabaseAdmin
          .from("rental_staff_notifications")
          .select("rental_staff_id")
          .eq("type", "reminder")
          .gte("created_at", cutoff);

        const rentalStaffIds = Array.from(
          new Set(
            (rentalRecents ?? [])
              .map((r) => r.rental_staff_id)
              .filter((id): id is string => !!id),
          ),
        );

        let profileIds: string[] = [];
        if (rentalStaffIds.length > 0) {
          const { data: profs } = await supabaseAdmin
            .from("rental_staff")
            .select("profile_id")
            .in("id", rentalStaffIds);
          profileIds = (profs ?? [])
            .map((p) => p.profile_id)
            .filter((id): id is string => !!id);
        }

        let pushSent = 0;
        let pushFailed = 0;
        let pushExpired = 0;
        if (staffIds.length > 0 || profileIds.length > 0) {
          const { sendPushToStaffId, sendPushToProfileId } = await import("@/lib/push.server");
          const results = await Promise.all([
            ...staffIds.map((id) => sendPushToStaffId(id)),
            ...profileIds.map((id) => sendPushToProfileId(id)),
          ]);
          for (const r of results) {
            pushSent += r.sent;
            pushFailed += r.failed;
            pushExpired += r.expired;
          }
        }

        return Response.json({
          reminders: sent ?? 0,
          rentalReminders: rentalSent ?? 0,
          push: { sent: pushSent, failed: pushFailed, expired: pushExpired },
        });
      },
    },
  },
});
