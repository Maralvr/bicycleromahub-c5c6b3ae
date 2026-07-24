import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/heal-bokun-zeros")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { healStuckZeroParticipantBookings } = await import("@/lib/bokun-import.server");
          const result = await healStuckZeroParticipantBookings(30);
          console.log("[heal-bokun-zeros]", result);
          return new Response(JSON.stringify({ success: true, ...result }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          const msg = (e as Error).message;
          console.error("[heal-bokun-zeros] failed:", msg);
          return new Response(JSON.stringify({ success: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
