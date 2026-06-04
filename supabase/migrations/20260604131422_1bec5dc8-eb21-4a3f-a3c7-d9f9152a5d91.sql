DO $$
DECLARE
  t text;
  tables text[] := ARRAY['shifts','staff','staff_unavailability','tasks','task_updates','field_updates','guide_notes','booking_notes','waiver_signatures','staff_rental_points','profiles'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;