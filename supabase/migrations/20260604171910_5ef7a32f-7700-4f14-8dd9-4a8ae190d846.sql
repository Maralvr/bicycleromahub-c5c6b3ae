GRANT SELECT, INSERT, UPDATE, DELETE ON public.field_updates TO authenticated;
GRANT ALL ON public.field_updates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guide_notes TO authenticated;
GRANT ALL ON public.guide_notes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_updates TO authenticated;
GRANT ALL ON public.task_updates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_notes TO authenticated;
GRANT ALL ON public.booking_notes TO service_role;