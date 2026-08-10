// Server-only email notifications via Resend.
// Fire-and-forget: failures are logged, never thrown into the UI flow.

const RESEND_URL = "https://api.resend.com/emails";

function getFrom(): string {
  return (
    process.env["RESEND_FROM_EMAIL"] ||
    "Bicycle Roma Hub <noreply@notifications.bicycleroma.com>"
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


/** Brand palette mirrored from the app's design tokens (green primary). */
const BRAND = {
  green: "#2eb84f",
  greenDark: "#1f8f3c",
  ink: "#111c14",
  body: "#334036",
  muted: "#6b7a6f",
  border: "#dfe8e1",
  surface: "#ffffff",
  tint: "#f4faf5",
};

function renderHtml(input: MailInput): string {
  // Callers may pass multi-line strings (e.g. a broadcast message body).
  // Flatten them so every physical line becomes its own paragraph row,
  // otherwise everything collapses into one unreadable block of text.
  const flat = input.lines.flatMap((l) => (l ?? "").split(/\r?\n/));

  const rows = flat
    .map((l) => {
      if (!l.trim()) return `<tr><td style="height:12px;line-height:12px;">&nbsp;</td></tr>`;
      const signoff = l.trimStart().startsWith("—");
      const text = escapeHtml(l.trim());
      // "Label: value" lines get a bolded label for scannability.
      const m = /^([^:]{2,40}):\s(.+)$/.exec(l.trim());
      const inner =
        !signoff && m
          ? `<strong style="color:${BRAND.ink};font-weight:600;">${escapeHtml(m[1])}:</strong> ${escapeHtml(m[2])}`
          : text;
      return `<tr><td style="padding:5px 0;font-size:15px;line-height:24px;color:${
        signoff ? BRAND.muted : BRAND.body
      };${signoff ? "font-style:italic;" : ""}">${inner}</td></tr>`;
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND.tint};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.tint};">
    <tr><td align="center" style="padding:32px 14px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;">
        <tr><td style="background:${BRAND.green};background-image:linear-gradient(135deg,${BRAND.green},${BRAND.greenDark});padding:16px 26px;">
          <span style="font-size:14px;font-weight:700;letter-spacing:.4px;color:#ffffff;text-transform:uppercase;">Bicycle Roma Hub</span>
        </td></tr>
        <tr><td style="padding:26px 26px 8px;">
          <div style="font-size:20px;line-height:28px;font-weight:700;color:${BRAND.ink};">${escapeHtml(input.heading)}</div>
          <div style="height:14px;line-height:14px;">&nbsp;</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        </td></tr>
        <tr><td style="padding:8px 26px 0;"><div style="border-top:1px solid ${BRAND.border};height:1px;line-height:1px;">&nbsp;</div></td></tr>
        <tr><td style="padding:14px 26px 24px;font-size:12px;line-height:18px;color:${BRAND.muted};">${escapeHtml(
          input.footer ?? "Bicycle Roma Hub · automated notification",
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
  const apiKey = process.env["RESEND_API_KEY"]?.trim();
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
      dedupeKey: `rental:${rentalStaffId}:${pointId}:${date}:${hhmm(times?.start)}-${hhmm(times?.end)}:${kind}`,
      dedupeWindowMinutes: 24 * 60,
    });
  } catch (e) {
    console.error("[email-notify] rental assignment email failed:", e);
  }
}
