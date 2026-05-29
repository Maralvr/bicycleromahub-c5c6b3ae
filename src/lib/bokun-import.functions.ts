import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  runBokunImport,
  startBokunImport,
  processBokunImportChunk,
  continueBokunImport,
  assertAdmin,
} from "./bokun-import.server";

/**
 * Kick off a manual Bokun import — creates a run row and returns its id.
 * The client then calls `processBokunImportChunkFn` repeatedly until done.
 */
export const startBokunImportFn = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      accessToken: z.string().min(20),
      fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    await assertAdmin(data.accessToken);
    return startBokunImport(data.fromDate, data.toDate, "manual");
  });

/** Process one page (~50 bookings) of an in-flight run. */
export const processBokunImportChunkFn = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      accessToken: z.string().min(20),
      runId: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    await assertAdmin(data.accessToken);
    return processBokunImportChunk(data.runId);
  });

/** Cron: import March 2026 onward. Resumes the existing cron run before starting a new one. */
export const syncBokunCronImport = createServerFn({ method: "POST" })
  .handler(async () => {
    const { data: inflight, error: inflightError } = await supabaseAdmin
      .from("bokun_import_runs")
      .select("id, started_at, total_seen, next_page")
      .eq("trigger", "cron")
      .is("finished_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (inflightError) throw new Error(`Could not check in-flight Bokun run: ${inflightError.message}`);
    if (inflight) {
      return continueBokunImport(inflight.id, { maxPages: 1 });
    }

    const today = new Date();
    const from = "2026-03-01";
    const to = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    return runBokunImport(from, to, "cron", { maxPages: 1 });
  });



/** Get the current Bokun cron schedule status and last run time. */
export const getBokunCronStatusFn = createServerFn({ method: "POST" })
  .handler(async () => {
    const { data, error } = await supabaseAdmin.rpc("get_bokun_cron_status");
    if (error) throw new Error(error.message);
    return (data as { isScheduled: boolean; schedule: string | null; lastRun: { startTime: string; endTime: string | null; status: string } | null }) ?? { isScheduled: false, schedule: null, lastRun: null };
  });
