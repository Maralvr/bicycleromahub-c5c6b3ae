import { supabase } from "@/integrations/supabase/client";

/**
 * Marks (or clears) a shift/booking as a customer no-show. Callable by
 * admins (any shift), guides (only their own assigned shift), and rental
 * staff (any rental-point booking, matching their existing full read
 * visibility) -- authorization is enforced inside the set_shift_no_show
 * SECURITY DEFINER function itself, not by RLS on shifts directly (guides
 * and rental staff have no UPDATE access to shifts otherwise).
 *
 * set_shift_no_show isn't in the generated Supabase types yet (added in
 * 20260709020000) -- `as never` on the rpc name/args follows the same
 * existing pattern used elsewhere in this codebase (waivers-store.ts,
 * rental-staff.functions.ts) for calling a function ahead of a fresh
 * codegen run.
 */
export async function setShiftNoShow(shiftId: string, noShow: boolean, notes?: string) {
  const { error } = await supabase.rpc("set_shift_no_show" as never, {
    _shift_id: shiftId,
    _no_show: noShow,
    _notes: notes?.trim() || null,
  } as never);
  return { error };
}
