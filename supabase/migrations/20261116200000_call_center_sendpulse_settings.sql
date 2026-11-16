-- SendPulse bridge credentials in Call Center Settings (admin editable).
-- Webhook secret is stored encrypted (AES-256-GCM via AI_CREDENTIALS_ENCRYPTION_KEY).
-- WhatsApp number is plain E.164 (same pattern as phone number IDs).

BEGIN;

ALTER TABLE public.call_center_settings
  ADD COLUMN IF NOT EXISTS sendpulse_webhook_secret text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sendpulse_whatsapp_number text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.call_center_settings.sendpulse_webhook_secret IS
  'SendPulse inbound webhook shared secret (encrypted at rest with AI_CREDENTIALS_ENCRYPTION_KEY). Env SENDPULSE_WEBHOOK_SECRET is fallback.';

COMMENT ON COLUMN public.call_center_settings.sendpulse_whatsapp_number IS
  'SendPulse chatbot WhatsApp number (E.164). Env SENDPULSE_WHATSAPP_NUMBER is fallback. Must differ from FEC inbox number.';

COMMIT;
