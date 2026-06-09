
REVOKE EXECUTE ON FUNCTION public.log_shift_dispatch_event() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.log_shift_dispatch_on_insert() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_shift_assignment() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_shift_assignment_on_insert() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.shifts_block_sensitive_update() FROM authenticated;
