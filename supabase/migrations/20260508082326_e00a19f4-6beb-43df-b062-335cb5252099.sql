
REVOKE EXECUTE ON FUNCTION public.next_invoice_number(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(integer) TO authenticated;
