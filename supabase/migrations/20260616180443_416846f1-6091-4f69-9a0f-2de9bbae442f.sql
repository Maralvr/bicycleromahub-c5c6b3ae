
DROP POLICY IF EXISTS "users or admins delete comments" ON public.broadcast_comments;
CREATE POLICY "users delete own comments"
  ON public.broadcast_comments FOR DELETE TO authenticated
    USING (author_profile_id = auth.uid());
