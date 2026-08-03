import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/sync-bokun-product-rates")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { syncBokunProductRates } = await import("@/lib/bokun-product-rates.server");
          const result = await syncBokunProductRates();
          console.log("[sync-bokun-product-rates]", result);
          return new Response(JSON.stringify({ success: true, ...result }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          const msg = (e as Error).message;
          console.error("[sync-bokun-product-rates] failed:", msg);
          return new Response(JSON.stringify({ success: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
