import { supabase } from "@/integrations/supabase/client";

/**
 * Customer payment rates are admin-only at the database level: the `rate`
 * column of `public.shifts` is not selectable by guides or rental staff, so it
 * is fetched separately through the admin-only `shift_rates` RPC. Non-admins
 * simply get an empty map (no error), which keeps the UI rate-free for them.
 */
export async function fetchShiftRates(ids: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return out;
  const { data, error } = await supabase.rpc("shift_rates" as never, { _ids: unique } as never);
  if (error) return out;
  for (const row of (data ?? []) as Array<{ id: string; rate: number | string | null }>) {
    out.set(row.id, row.rate != null ? Number(row.rate) : null);
  }
  return out;
}
