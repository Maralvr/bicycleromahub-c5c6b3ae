
CREATE TABLE public.bokun_import_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'manual',
  total_seen INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bokun_import_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bokun_runs_admin_all" ON public.bokun_import_runs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_bokun_runs_started_at ON public.bokun_import_runs (started_at DESC);
