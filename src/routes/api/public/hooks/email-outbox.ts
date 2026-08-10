import { createFileRoute } from "@tanstack/react-router";

type OutboxRow = {
  id: string;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  heading: string;
  lines: string[] | null;
  category: string;
  dedupe_key: string | null;
  attempts: number;
  created_at: string;
};

const MAX_ATTEMPTS = 4;
const BATCH = 25;
/** Emails older than this are dropped rather than delivered late. */
const MAX_AGE_MINUTES = 12 * 60;

/**
 * Drains public.email_outbox: rows queued by database triggers (additional
 * guides, shift detail changes, reminders, tasks, broadcasts, accept/reject
 * feedback to admins) are sent through Resend here.
 */
export const Route = createFileRoute("/api/public/hooks/email-outbox")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendMail } = await import("@/lib/email-notify.server");

        const { data, error } = await supabaseAdmin
          .from("email_outbox" as never)
          .select("*")
          .is("sent_at", null)
          .lt("attempts", MAX_ATTEMPTS)
          .order("created_at", { ascending: true })
          .limit(BATCH);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const rows = (data ?? []) as unknown as OutboxRow[];
        let sent = 0;
        let failed = 0;
        let expired = 0;

        for (const row of rows) {
          const ageMinutes = (Date.now() - new Date(row.created_at).getTime()) / 60000;
          if (ageMinutes > MAX_AGE_MINUTES) {
            await supabaseAdmin
              .from("email_outbox" as never)
              .update({
                sent_at: new Date().toISOString(),
                last_error: "expired before send",
              } as never)
              .eq("id", row.id);
            expired += 1;
            continue;
          }

          const result = await sendMail({
            to: row.recipient_email,
            subject: row.subject,
            heading: row.heading,
            lines: (row.lines ?? []).filter((l) => l !== null),
            dedupeKey: row.dedupe_key ?? undefined,
            dedupeWindowMinutes: 24 * 60,
          });

          if (result.ok) {
            await supabaseAdmin
              .from("email_outbox" as never)
              .update({ sent_at: new Date().toISOString(), last_error: null } as never)
              .eq("id", row.id);
            sent += 1;
          } else {
            await supabaseAdmin
              .from("email_outbox" as never)
              .update({
                attempts: row.attempts + 1,
                last_error: result.error ?? "unknown error",
              } as never)
              .eq("id", row.id);
            failed += 1;
          }
        }

        return Response.json({ picked: rows.length, sent, failed, expired });
      },
    },
  },
});
