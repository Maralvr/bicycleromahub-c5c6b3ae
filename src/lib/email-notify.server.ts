// Server-only email notifications via Resend.
// Fire-and-forget: failures are logged, never thrown into the UI flow.

const RESEND_URL = "https://api.resend.com/emails";

function getFrom(): string {
  return (
    process.env["RESEND_FROM_EMAIL"] ||
    "Bicycle Roma Hub <notifications@notifications.bicycleroma.com>"
  );
}

export type MailInput = {
  to: string;
  subject: string;
  heading: string;
  lines: string[];
  footer?: string;
  /** When set, the same key won't be emailed twice within `dedupeWindowMinutes`. */
  dedupeKey?: string;
  dedupeWindowMinutes?: number;
};

/**
 * Returns true when this email is a duplicate of one already sent inside the
 * dedupe window, so the caller should skip sending it.
 */
async function isDuplicateSend(key: string, windowMinutes: number): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
    const { data: existing } = await supabaseAdmin
      .from("email_send_dedupe" as any)
      .select("dedupe_key, sent_at")
      .eq("dedupe_key", key)
      .maybeSingle();
    if (existing && (existing as any).sent_at > cutoff) return true;
    await supabaseAdmin
      .from("email_send_dedupe" as any)
      .upsert({ dedupe_key: key, sent_at: new Date().toISOString() } as any, {
        onConflict: "dedupe_key",
      });
    return false;
  } catch (e) {
    console.error("[email-notify] dedupe check failed:", e);
    return false;
  }
}


function renderHtml(input: MailInput): string {
  const rows = input.lines
    .map(
      (l) =>
        `<tr><td style="padding:4px 0;font-size:14px;color:#1f2937;">${escapeHtml(l)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
        <tr><td style="font-size:18px;font-weight:bold;color:#111827;padding-bottom:12px;">${escapeHtml(input.heading)}</td></tr>
        ${rows}
        <tr><td style="padding-top:18px;font-size:12px;color:#6b7280;">${escapeHtml(
          input.footer ?? "Bicycle Roma Hub",
        )}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendMail(input: MailInput): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY not configured" };
  if (!input.to || !input.to.includes("@")) return { ok: false, error: "no recipient email" };

  if (input.dedupeKey) {
    const dup = await isDuplicateSend(input.dedupeKey, input.dedupeWindowMinutes ?? 60);
    if (dup) return { ok: true };
  }



  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: getFrom(),
        to: [input.to],
        subject: input.subject,
        html: renderHtml(input),
        text: [input.heading, ...input.lines].join("\n"),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[email-notify] Resend failed [${res.status}]: ${body}`);
      return { ok: false, error: `Resend ${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[email-notify] Resend threw: ${msg}`);
    return { ok: false, error: msg };
  }
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return "";
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function hhmm(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "";
}

export type RentalEmailKind = "assigned" | "cancelled";

/**
 * Emails a rental-staff member when a manager assigns them to a rental point
 * day, or cancels that assignment. Pay rates are never included.
 */
export async function sendRentalAssignmentEmail(
  rentalStaffId: string,
  pointId: string,
  date: string,
  kind: RentalEmailKind,
  times?: { start?: string | null; end?: string | null },
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: staffRow }, { data: pointRow }] = await Promise.all([
      supabaseAdmin.from("rental_staff").select("name, email").eq("id", rentalStaffId).maybeSingle(),
      supabaseAdmin.from("rental_points").select("name").eq("id", pointId).maybeSingle(),
    ]);
    if (!staffRow?.email) return;

    const range =
      times?.start || times?.end ? ` (${hhmm(times?.start)}–${hhmm(times?.end)})` : "";
    const pointName = pointRow?.name ?? "rental point";

    await sendMail({
      to: staffRow.email,
      subject:
        kind === "assigned"
          ? `New rental shift · ${pointName} · ${formatDate(date)}`
          : `Rental shift cancelled · ${pointName} · ${formatDate(date)}`,
      heading:
        kind === "assigned"
          ? "You have a new rental point shift"
          : "A rental point shift was cancelled",
      lines: [
        `Hi ${staffRow.name ?? "there"},`,
        "",
        `Rental point: ${pointName}`,
        `Date: ${formatDate(date)}${range}`,
        "",
        kind === "assigned"
          ? "Please open the app to accept or decline this day."
          : "No action is needed — your calendar has been updated.",
      ],
    });
  } catch (e) {
    console.error("[email-notify] rental assignment email failed:", e);
  }
}
