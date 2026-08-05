ALTER TABLE public.waiver_signatures REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.waiver_signatures;