import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Kick off a manual Bokun import — creates a run row and returns its id.
 * The client then calls `processBokunImportChunkFn` repeatedly until done.
 */
export const startBokunImportFn = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        accessToken: z.string().min(20),
        fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        toDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { assertAdmin, startBokunImport } = await import("./bokun-import.server");
    await assertAdmin(data.accessToken);
    return startBokunImport(data.fromDate, data.toDate, "manual");
  });

/** Process one page (~50 bookings) of an in-flight run. */
export const processBokunImportChunkFn = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        accessToken: z.string().min(20),
        runId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { assertAdmin, processBokunImportChunk } = await import("./bokun-import.server");
    await assertAdmin(data.accessToken);
    return processBokunImportChunk(data.runId);
  });

/**
 * Cron: import current month onward.
 *
 * The Bokun search window starts at the 1st of the current month so each
 * cron tick only paginates through relevant bookings. The per-row date
 * filter inside `processBokunImportChunk` also drops anything older than
 * the 1st of the current month (travel date or booking-creation date),
 * and existing bookings are never reimported.
 *
 * Resumes the existing in-flight cron run before starting a new one.
 */
export const syncBokunCronImport = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { continueBokunImport, runBokunImport, healStuckZeroParticipantBookings } =
    await import("./bokun-import.server");
  const { data: inflight, error: inflightError } = await supabaseAdmin
    .from("bokun_import_runs")
    .select("id, started_at, total_seen, next_page")
    .eq("trigger", "cron")
    .is("finished_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (inflightError)
    throw new Error(`Could not check in-flight Bokun run: ${inflightError.message}`);

  let result;
  if (inflight) {
    result = await continueBokunImport(inflight.id, { maxPages: 20 });
  } else {
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const from = `${today.getUTCFullYear()}-${pad(today.getUTCMonth() + 1)}-01`;
    const to = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    result = await runBokunImport(from, to, "cron", { maxPages: 20 });
  }

  // The search-pagination sweep above can miss a small number of bookings
  // regardless of how many times it's re-run (see healStuckZeroParticipantBookings'
  // doc comment). Only worth paying for once the main sweep has actually
  // finished a full pass -- no point re-fetching known-stuck rows against
  // a still-incomplete picture of what's actually stuck.
  if (result.done) {
    try {
      const heal = await healStuckZeroParticipantBookings(30);
      return { ...result, heal };
    } catch (e) {
      return { ...result, heal: { error: (e as Error).message } };
    }
  }
  return result;
});

/** Get the current Bokun cron schedule status and last run time. */
export const getBokunCronStatusFn = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("get_bokun_cron_status");
  if (error) throw new Error(error.message);
  return (
    (data as {
      isScheduled: boolean;
      schedule: string | null;
      lastRun: { startTime: string; endTime: string | null; status: string } | null;
    }) ?? { isScheduled: false, schedule: null, lastRun: null }
  );
});
