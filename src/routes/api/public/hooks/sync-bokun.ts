import { createFileRoute } from "@tanstack/react-router";
import { runBokunImport } from "@/lib/bokun-import.functions";

export const Route = createFileRoute("/api/public/hooks/sync-bokun")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await runBokunImport("2026-03-01");
          console.log("[sync-bokun]", result);
          return new Response(JSON.stringify({ success: true, ...result }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          const msg = (e as Error).message;
          console.error("[sync-bokun] failed:", msg);
          return new Response(JSON.stringify({ success: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
