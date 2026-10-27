-- Outbound email settings (Resend + webhook). One row, service role only.
-- managed=false (seed) keeps env-only behaviour until CEO/COO saves in Admin UI.
-- Secrets never grant to authenticated/anon.

BEGIN;

CREATE TABLE public.app_email_settings (
  id uuid PRIMARY KEY,
  managed boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT false,
  from_address text NOT NULL DEFAULT '',
  resend_api_key text NOT NULL DEFAULT '',
  webhook_url text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.app_email_settings IS
  'Server-only outbound email credentials. No authenticated policies. Do not select from the browser.';

COMMENT ON COLUMN public.app_email_settings.managed IS
  'False until an admin saves in the UI. While false, runtime falls back to env vars.';

COMMENT ON COLUMN public.app_email_settings.resend_api_key IS
  'Resend API key. Service role only. Never return this value to the client.';

COMMENT ON COLUMN public.app_email_settings.webhook_url IS
  'Notification email webhook URL. Service role only. Never return the full URL to the client.';

INSERT INTO public.app_email_settings (id, managed, enabled, from_address, resend_api_key, webhook_url)
VALUES ('00000000-0000-4000-8000-0000000000e1', false, false, '', '', '')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_email_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.app_email_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.app_email_settings TO service_role;

COMMIT;
