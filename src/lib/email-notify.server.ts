// Server-only email notifications via Resend.
// Fire-and-forget: failures are logged, never thrown into the UI flow.

const RESEND_URL = "https://api.resend.com/emails";

function getFrom(): string {
  return process.env["RESEND_FROM_EMAIL"] || "Bicycle Roma Hub <onboarding@resend.dev>";
}

export type MailInput = {
  to: string;
  subject: string;
  heading: string;
  lines: string[];
  footer?: string;
};

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
