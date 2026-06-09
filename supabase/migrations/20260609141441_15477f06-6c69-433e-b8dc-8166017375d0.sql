INSERT INTO public.user_roles (user_id, role)
VALUES ('b634f016-f93e-43f7-b779-0cfb2b5a17ae', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;