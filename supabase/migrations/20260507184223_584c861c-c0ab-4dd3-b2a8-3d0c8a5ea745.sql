CREATE TABLE public.waiver_signatures (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_signature_id text UNIQUE,
  booking_id text,
  email text,
  signer_name text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  waiver_template_id text,
  matched_shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_waiver_signatures_booking_id ON public.waiver_signatures (booking_id);
CREATE INDEX idx_waiver_signatures_email ON public.waiver_signatures (lower(email));
CREATE INDEX idx_waiver_signatures_shift ON public.waiver_signatures (matched_shift_id);

ALTER TABLE public.waiver_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws_select" ON public.waiver_signatures
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ws_admin_all" ON public.waiver_signatures
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.waiver_signatures;