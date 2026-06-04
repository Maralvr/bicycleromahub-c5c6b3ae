REVOKE ALL ON FUNCTION public.cancel_shift_request(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expire_shift_requests() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shifts_block_sensitive_update() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cancel_shift_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_shift_requests() TO service_role;