CREATE OR REPLACE FUNCTION public.get_bokun_cron_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_jobs jsonb;
  v_last_run jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'jobid', jobid,
    'jobname', jobname,
    'schedule', schedule,
    'active', active
  )) INTO v_jobs
  FROM cron.job
  WHERE command LIKE '%sync-bokun%';

  SELECT jsonb_build_object(
    'startTime', start_time,
    'endTime', end_time,
    'status', status
  ) INTO v_last_run
  FROM cron.job_run_details
  WHERE command LIKE '%sync-bokun%'
  ORDER BY start_time DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'isScheduled', COALESCE(jsonb_array_length(v_jobs) > 0, false),
    'schedule', COALESCE(v_jobs->0->>'schedule', null),
    'lastRun', v_last_run
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_bokun_cron_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bokun_cron_status() TO service_role;