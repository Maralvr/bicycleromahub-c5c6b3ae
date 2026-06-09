
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  endpoint text UNIQUE NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own push subs or admin sees all"
  ON public.push_subscriptions FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own push subs"
  ON public.push_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users update own push subs"
  ON public.push_subscriptions FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users delete own push subs"
  ON public.push_subscriptions FOR DELETE
  TO authenticated
  USING (profile_id = auth.uid());

CREATE INDEX idx_push_subs_staff ON public.push_subscriptions(staff_id);
CREATE INDEX idx_push_subs_profile ON public.push_subscriptions(profile_id);

-- Security fix: remove broad authenticated INSERT on realtime.messages.
-- Clients only subscribe (SELECT); broadcasts come from postgres_changes / server side.
DROP POLICY IF EXISTS "Authenticated users can publish to app channels" ON realtime.messages;
