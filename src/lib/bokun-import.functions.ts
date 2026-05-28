import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { runBokunImport, assertAdmin } from "./bokun-import.server";

export const importBokunBookings = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      accessToken: z.string().min(20),
      fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    await assertAdmin(data.accessToken);
    return runBokunImport(data.fromDate, data.toDate);
  });

export const syncBokunCronImport = createServerFn({ method: "POST" })
  .handler(async () => {
    // Rolling window: last 30 days → next 180 days. Keeps each cron tick small.
    const today = new Date();
    const from = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const to = new Date(today.getTime() + 180 * 24 * 60 * 60 * 1000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return runBokunImport(iso(from), iso(to), "cron", { maxPages: 1 });
  });
