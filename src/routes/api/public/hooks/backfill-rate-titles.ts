import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/backfill-rate-titles")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { backfillMissingRateTitles } = await import("@/lib/bokun-import.server");
          const result = await backfillMissingRateTitles(40);
          console.log("[backfill-rate-titles]", result);
          return new Response(JSON.stringify({ success: true, ...result }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          const msg = (e as Error).message;
          console.error("[backfill-rate-titles] failed:", msg);
          return new Response(JSON.stringify({ success: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
