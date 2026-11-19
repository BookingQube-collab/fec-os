-- Call Center Android FCM device tokens (Capacitor softphone).
-- Service role sends high-priority offers; agents manage their own rows via server actions.

BEGIN;

CREATE TABLE public.call_center_fcm_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL DEFAULT 'android'
    CHECK (platform IN ('android', 'ios', 'web')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT call_center_fcm_tokens_token_key UNIQUE (token)
);

COMMENT ON TABLE public.call_center_fcm_tokens IS
  'FCM registration tokens for Call Center Capacitor / native softphone. Service role sends; users manage own rows via server actions.';

CREATE INDEX call_center_fcm_tokens_user_idx
  ON public.call_center_fcm_tokens (user_id);

ALTER TABLE public.call_center_fcm_tokens ENABLE ROW LEVEL SECURITY;

-- Browser never reads/writes directly; server actions use service role.
REVOKE ALL ON TABLE public.call_center_fcm_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.call_center_fcm_tokens TO service_role;

COMMIT;
