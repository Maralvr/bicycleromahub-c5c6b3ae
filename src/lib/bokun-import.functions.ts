import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  runBokunImport,
  startBokunImport,
  processBokunImportChunk,
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

/** Cron: rolling window, one page per tick. */
export const syncBokunCronImport = createServerFn({ method: "POST" })
  .handler(async () => {
    const today = new Date();
    const from = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const to = new Date(today.getTime() + 180 * 24 * 60 * 60 * 1000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return runBokunImport(iso(from), iso(to), "cron", { maxPages: 1 });
  });

/** Get the current Bokun cron schedule status and last run time. */
export const getBokunCronStatusFn = createServerFn({ method: "POST" })
  .handler(async () => {
    const { data: jobs } = await supabaseAdmin
      .schema("cron")
      .from("job")
      .select("jobid,jobname,schedule,active")
      .ilike("command", "%sync-bokun%");

    const isScheduled = (jobs?.length ?? 0) > 0;
    const schedule = jobs?.[0]?.schedule ?? null;

    const { data: lastRuns } = await supabaseAdmin
      .schema("cron")
      .from("job_run_details")
      .select("start_time,end_time,status")
      .ilike("command", "%sync-bokun%")
      .order("start_time", { ascending: false })
      .limit(1);

    const lastRun = lastRuns?.[0] ?? null;

    return {
      isScheduled,
      schedule,
      lastRun: lastRun
        ? {
            startTime: lastRun.start_time as string,
            endTime: lastRun.end_time as string | null,
            status: lastRun.status as string,
          }
        : null,
    };
  });
