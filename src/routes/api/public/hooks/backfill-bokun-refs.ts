import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/backfill-bokun-refs")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { backfillMissingExternalBookingRefs } = await import("@/lib/bokun-import.server");
          const result = await backfillMissingExternalBookingRefs(40);
          console.log("[backfill-bokun-refs]", result);
          return new Response(JSON.stringify({ success: true, ...result }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          const msg = (e as Error).message;
          console.error("[backfill-bokun-refs] failed:", msg);
          return new Response(JSON.stringify({ success: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
