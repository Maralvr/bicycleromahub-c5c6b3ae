CREATE TABLE IF NOT EXISTS public.email_send_dedupe (
  dedupe_key TEXT PRIMARY KEY,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.email_send_dedupe TO service_role;
ALTER TABLE public.email_send_dedupe ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS email_send_dedupe_sent_at_idx ON public.email_send_dedupe (sent_at);