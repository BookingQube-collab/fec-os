-- WhatsApp first-message auto-reply + inbound message-id uniqueness for Meta retries.

BEGIN;

ALTER TABLE public.call_center_settings
  ADD COLUMN IF NOT EXISTS whatsapp_auto_reply_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_auto_reply_text text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.call_center_settings.whatsapp_auto_reply_enabled IS
  'When true (and WhatsApp enabled), send whatsapp_auto_reply_text once on new conversations.';
COMMENT ON COLUMN public.call_center_settings.whatsapp_auto_reply_text IS
  'Free-form Cloud API text sent as the first automated reply on a new WhatsApp conversation.';

-- Deduplicate Meta webhook retries / redeliveries by WhatsApp message id.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cc_wa_messages_wa_message_id_unique
  ON public.call_center_whatsapp_messages (wa_message_id)
  WHERE wa_message_id <> '';

COMMIT;
