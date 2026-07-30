-- 1. shifts: make autovacuum actually fire on this table.
-- Cluster defaults (threshold 50 + 20% of 3,543 rows = ~758 dead tuples) mean
-- a table with a steady trickle of updates never crosses the trigger point, so
-- autovacuum has never run here. Tighten the per-table thresholds instead of
-- relying on one-off manual VACUUMs.
ALTER TABLE public.shifts SET (
  autovacuum_enabled = true,
  autovacuum_vacuum_scale_factor = 0.01,
  autovacuum_vacuum_threshold = 50,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_analyze_threshold = 50
);

-- Same reasoning for the other high-churn tables.
ALTER TABLE public.guide_notifications SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.05
);
ALTER TABLE public.bokun_import_runs SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.05
);

-- 2. bokun_import_runs retention: keep 30 days of sync history.
CREATE OR REPLACE FUNCTION public.prune_bokun_import_runs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.bokun_import_runs
   WHERE started_at < now() - interval '30 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_bokun_import_runs() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'prune-bokun-import-runs',
  '30 3 * * *',
  $$SELECT public.prune_bokun_import_runs();$$
);