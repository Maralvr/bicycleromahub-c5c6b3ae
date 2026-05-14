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
  .handler(async () => runBokunImport("2026-03-01", undefined, "cron"));
