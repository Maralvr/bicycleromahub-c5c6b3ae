import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/expire-shift-requests")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("expire_shift_requests" as never);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return Response.json({ expired: data ?? 0 });
      },
    },
  },
});
