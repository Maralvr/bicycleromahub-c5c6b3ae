ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts;
ALTER TABLE public.shifts REPLICA IDENTITY FULL;