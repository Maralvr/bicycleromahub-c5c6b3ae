import { createFileRoute } from "@tanstack/react-router";
import { syncBokunCronImport } from "@/lib/bokun-import.functions";

export const Route = createFileRoute("/api/public/hooks/sync-bokun")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Optional { "resumeOnly": true } body: only continue an in-flight
          // run, never start a new sweep. Lets a frequent cron finish the
          // pages a single 55s request couldn't get through, without paying
          // for a fresh full scan every tick.
          let resumeOnly = false;
          try {
            const body = (await request.json()) as { resumeOnly?: boolean } | null;
            resumeOnly = body?.resumeOnly === true;
          } catch {
            resumeOnly = false;
          }
          const result = await syncBokunCronImport({ data: { resumeOnly } });
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
