
REVOKE EXECUTE ON FUNCTION public.notify_rental_assignment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_rental_point_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_rental_point_reminders() TO service_role;
-- handle_new_user is a trigger on auth.users; remove direct callers too
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
