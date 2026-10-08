-- Chat Hub browser push. Settings are one server-only row.
-- Subscriptions are per user. The browser cannot read another user's row
-- or the VAPID private key. No real keys are inserted here.

BEGIN;

CREATE TABLE public.chat_push_settings (
  id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  vapid_public_key text NOT NULL DEFAULT '',
  vapid_private_key text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.chat_push_settings IS
  'Server-only VAPID credentials for Chat Hub browser push. No authenticated policies. Do not select from the browser.';

COMMENT ON COLUMN public.chat_push_settings.vapid_private_key IS
  'VAPID private key. Service role only. Never return this value to the client.';

INSERT INTO public.chat_push_settings (id, enabled, vapid_public_key, vapid_private_key)
VALUES ('00000000-0000-4000-8000-0000000000c5', false, '', '')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.chat_push_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.chat_push_settings FROM PUBLIC, anon, authenticated;
REVOKE SELECT (vapid_private_key) ON TABLE public.chat_push_settings FROM anon, authenticated;
GRANT ALL ON TABLE public.chat_push_settings TO service_role;

CREATE TABLE public.chat_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_push_subscriptions_endpoint_key UNIQUE (endpoint)
);

COMMENT ON TABLE public.chat_push_subscriptions IS
  'Web Push subscriptions. A signed-in user can select, insert, and delete only their own rows.';

CREATE INDEX chat_push_subscriptions_user_idx
  ON public.chat_push_subscriptions (user_id);

CREATE OR REPLACE FUNCTION public.chat_push_subscription_force_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth.uid() is required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.chat_push_subscription_force_user() IS
  'Forces chat_push_subscriptions.user_id to auth.uid() on insert and update.';

CREATE TRIGGER chat_push_subscriptions_force_user
  BEFORE INSERT OR UPDATE ON public.chat_push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.chat_push_subscription_force_user();

ALTER TABLE public.chat_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_push_subscriptions_select ON public.chat_push_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY chat_push_subscriptions_insert ON public.chat_push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY chat_push_subscriptions_update ON public.chat_push_subscriptions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY chat_push_subscriptions_delete ON public.chat_push_subscriptions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.chat_push_subscriptions FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chat_push_subscriptions TO authenticated;
GRANT ALL ON TABLE public.chat_push_subscriptions TO service_role;

REVOKE ALL ON FUNCTION public.chat_push_subscription_force_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_push_subscription_force_user() TO authenticated, service_role;

COMMIT;
