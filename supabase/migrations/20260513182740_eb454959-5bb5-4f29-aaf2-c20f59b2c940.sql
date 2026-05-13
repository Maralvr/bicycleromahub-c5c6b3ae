ALTER TABLE public.staff REPLICA IDENTITY FULL;
ALTER TABLE public.staff_unavailability REPLICA IDENTITY FULL;
ALTER TABLE public.rental_points REPLICA IDENTITY FULL;
ALTER TABLE public.staff_rental_points REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.staff;
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_unavailability;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rental_points;
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_rental_points;