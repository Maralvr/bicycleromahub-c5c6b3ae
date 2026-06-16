
CREATE TABLE public.broadcast_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  field_update_id UUID NOT NULL REFERENCES public.field_updates(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (field_update_id, profile_id, emoji)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_reactions TO authenticated;
GRANT ALL ON public.broadcast_reactions TO service_role;
ALTER TABLE public.broadcast_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reactions readable by authenticated"
  ON public.broadcast_reactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "users insert own reactions"
  ON public.broadcast_reactions FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());
CREATE POLICY "users delete own reactions"
  ON public.broadcast_reactions FOR DELETE TO authenticated USING (profile_id = auth.uid());

CREATE INDEX broadcast_reactions_field_update_idx ON public.broadcast_reactions(field_update_id);

CREATE TABLE public.broadcast_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  field_update_id UUID NOT NULL REFERENCES public.field_updates(id) ON DELETE CASCADE,
  author_profile_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_initials TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_comments TO authenticated;
GRANT ALL ON public.broadcast_comments TO service_role;
ALTER TABLE public.broadcast_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments readable by authenticated"
  ON public.broadcast_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "users insert own comments"
  ON public.broadcast_comments FOR INSERT TO authenticated WITH CHECK (author_profile_id = auth.uid());
CREATE POLICY "users update own comments"
  ON public.broadcast_comments FOR UPDATE TO authenticated
    USING (author_profile_id = auth.uid()) WITH CHECK (author_profile_id = auth.uid());
CREATE POLICY "users or admins delete comments"
  ON public.broadcast_comments FOR DELETE TO authenticated
    USING (author_profile_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX broadcast_comments_field_update_idx ON public.broadcast_comments(field_update_id, created_at);

CREATE TRIGGER broadcast_comments_set_updated_at
  BEFORE UPDATE ON public.broadcast_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcast_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcast_comments;
