-- Chat Hub LiveKit credentials. One row, read only by the service role.
-- The browser must not select this table. api_secret never goes to a client.
-- Does not alter chat_calls. Calls still store provider NONE and recording_enabled false.

BEGIN;

CREATE TABLE public.chat_livekit_settings (
  id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  server_url text NOT NULL DEFAULT '',
  api_key text NOT NULL DEFAULT '',
  api_secret text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.chat_livekit_settings IS
  'Server-only LiveKit credentials for Chat Hub. No authenticated policies. Do not select from the browser.';

COMMENT ON COLUMN public.chat_livekit_settings.api_secret IS
  'LiveKit API secret. Service role only. Never return this value to the client.';

INSERT INTO public.chat_livekit_settings (id, enabled, server_url, api_key, api_secret)
VALUES ('00000000-0000-4000-8000-0000000000c4', false, '', '', '')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.chat_livekit_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.chat_livekit_settings FROM PUBLIC, anon, authenticated;
REVOKE SELECT (api_secret) ON TABLE public.chat_livekit_settings FROM anon, authenticated;
GRANT ALL ON TABLE public.chat_livekit_settings TO service_role;

COMMIT;
