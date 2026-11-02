-- Extend outbound email settings with generic SMTP (Mailgun/Gmail presets)
-- plus optional sender name. Resend + webhook columns remain unchanged.

BEGIN;

ALTER TABLE public.app_email_settings
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'resend',
  ADD COLUMN IF NOT EXISTS from_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS smtp_host text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS smtp_port integer NOT NULL DEFAULT 587,
  ADD COLUMN IF NOT EXISTS smtp_encryption text NOT NULL DEFAULT 'tls',
  ADD COLUMN IF NOT EXISTS smtp_username text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS smtp_password text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS smtp_preset text NOT NULL DEFAULT 'custom';

ALTER TABLE public.app_email_settings
  DROP CONSTRAINT IF EXISTS app_email_settings_provider_check;
ALTER TABLE public.app_email_settings
  ADD CONSTRAINT app_email_settings_provider_check
  CHECK (provider IN ('resend', 'smtp'));

ALTER TABLE public.app_email_settings
  DROP CONSTRAINT IF EXISTS app_email_settings_smtp_encryption_check;
ALTER TABLE public.app_email_settings
  ADD CONSTRAINT app_email_settings_smtp_encryption_check
  CHECK (smtp_encryption IN ('none', 'ssl', 'tls', 'starttls'));

ALTER TABLE public.app_email_settings
  DROP CONSTRAINT IF EXISTS app_email_settings_smtp_preset_check;
ALTER TABLE public.app_email_settings
  ADD CONSTRAINT app_email_settings_smtp_preset_check
  CHECK (smtp_preset IN ('custom', 'mailgun_eu', 'mailgun_us', 'gmail'));

COMMENT ON COLUMN public.app_email_settings.provider IS
  'Outbound driver: resend (HTTP API) or smtp (generic SMTP for Mailgun/Gmail/etc).';

COMMENT ON COLUMN public.app_email_settings.from_name IS
  'Optional display name for From header (Sender name).';

COMMENT ON COLUMN public.app_email_settings.smtp_host IS
  'SMTP hostname, e.g. smtp.eu.mailgun.org or smtp.gmail.com.';

COMMENT ON COLUMN public.app_email_settings.smtp_port IS
  'SMTP port (587 TLS/STARTTLS, 465 SSL).';

COMMENT ON COLUMN public.app_email_settings.smtp_encryption IS
  'SMTP encryption: none | ssl | tls | starttls.';

COMMENT ON COLUMN public.app_email_settings.smtp_username IS
  'SMTP auth username. Service role only.';

COMMENT ON COLUMN public.app_email_settings.smtp_password IS
  'SMTP auth password / App Password. Service role only. Never return to client.';

COMMENT ON COLUMN public.app_email_settings.smtp_preset IS
  'UI preset helper: custom | mailgun_eu | mailgun_us | gmail.';

COMMIT;
