import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ShiftEmailKind = "assigned" | "unassigned" | "cancelled" | "deleted";

/**
 * Emails a guide when an admin assigns, unassigns, cancels or deletes their
 * tour. Rates/fees are deliberately never included (guides must not see them).
 * Called fire-and-forget from the shifts store; never blocks the UI.
 */
export const notifyGuideShiftChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { shiftId: string; staffId: string; kind: ShiftEmailKind }) => {
    if (!input?.shiftId || !input?.staffId) throw new Error("shiftId and staffId required");
    if (!["assigned", "unassigned", "cancelled", "deleted"].includes(input.kind)) {
      throw new Error("invalid kind");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");

    const { sendMail, formatDate, hhmm } = await import("@/lib/email-notify.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: staffRow }, { data: shiftRow }] = await Promise.all([
      supabaseAdmin.from("staff").select("name, email").eq("id", data.staffId).maybeSingle(),
      supabaseAdmin
        .from("shifts")
        .select("tour_name, date, start_time, end_time, meeting_point, rate_title")
        .eq("id", data.shiftId)
        .maybeSingle(),
    ]);

    if (!staffRow?.email) return { ok: false, skipped: "no email on file" as const };
    if (!shiftRow) return { ok: false, skipped: "shift not found" as const };

    const when = `${formatDate(shiftRow.date)}${
      shiftRow.start_time ? ` at ${hhmm(shiftRow.start_time)}` : ""
    }${shiftRow.end_time ? `–${hhmm(shiftRow.end_time)}` : ""}`;

    const headings: Record<ShiftEmailKind, string> = {
      assigned: "You have a new tour assignment",
      unassigned: "You were removed from a tour",
      cancelled: "A tour you were assigned to was cancelled",
      deleted: "A tour you were assigned to was removed",
    };
    const subjects: Record<ShiftEmailKind, string> = {
      assigned: `New assignment · ${shiftRow.tour_name ?? "Tour"} · ${formatDate(shiftRow.date)}`,
      unassigned: `Assignment removed · ${shiftRow.tour_name ?? "Tour"} · ${formatDate(shiftRow.date)}`,
      cancelled: `Tour cancelled · ${shiftRow.tour_name ?? "Tour"} · ${formatDate(shiftRow.date)}`,
      deleted: `Tour removed · ${shiftRow.tour_name ?? "Tour"} · ${formatDate(shiftRow.date)}`,
    };

    const lines = [
      `Hi ${staffRow.name ?? "there"},`,
      "",
      `Tour: ${shiftRow.tour_name ?? "—"}`,
      `When: ${when}`,
      shiftRow.meeting_point ? `Meeting point: ${shiftRow.meeting_point}` : "",
      shiftRow.rate_title ? `Language / rate: ${shiftRow.rate_title}` : "",
      "",
      data.kind === "assigned"
        ? "Please open the app to accept or decline this tour."
        : "No action is needed — your calendar has been updated.",
    ].filter(Boolean);

    const result = await sendMail({
      to: staffRow.email,
      subject: subjects[data.kind],
      heading: headings[data.kind],
      lines,
      dedupeKey: `shift:${data.shiftId}:${data.staffId}:${data.kind}`,
      dedupeWindowMinutes: 24 * 60,
    });
    return result;
  });
