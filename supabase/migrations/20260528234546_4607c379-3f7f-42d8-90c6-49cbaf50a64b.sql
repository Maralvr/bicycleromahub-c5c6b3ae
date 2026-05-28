ALTER TABLE public.bokun_import_runs
  ADD COLUMN IF NOT EXISTS next_page integer NOT NULL DEFAULT 1;