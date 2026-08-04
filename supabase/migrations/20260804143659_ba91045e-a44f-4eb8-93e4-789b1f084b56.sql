CREATE OR REPLACE FUNCTION public.guide_names()
RETURNS TABLE(id uuid, name text, avatar text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.avatar
  FROM public.staff s
  WHERE public.has_role(auth.uid(), 'admin') OR public.is_rental_staff(auth.uid())
$$;

REVOKE ALL ON FUNCTION public.guide_names() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guide_names() TO authenticated;