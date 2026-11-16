-- Omnichannel threaded messages for Instagram / Messenger / M365 agent desktop.

BEGIN;

CREATE TABLE IF NOT EXISTS public.call_center_omni_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.call_center_omni_tickets(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  external_message_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'sent', 'failed', 'pending')),
  error_text text NOT NULL DEFAULT '',
  sent_by uuid,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_center_omni_messages_ticket
  ON public.call_center_omni_messages (ticket_id, created_at ASC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_call_center_omni_messages_external
  ON public.call_center_omni_messages (ticket_id, external_message_id)
  WHERE external_message_id <> '';

COMMENT ON TABLE public.call_center_omni_messages IS
  'Threaded messages for call_center_omni_tickets (Instagram, Messenger, M365 email).';

ALTER TABLE public.call_center_omni_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.call_center_omni_messages FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.call_center_omni_messages TO service_role;

-- Optional Graph subscription id for renewals (mailbox-level).
ALTER TABLE public.call_center_settings
  ADD COLUMN IF NOT EXISTS m365_subscription_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS m365_subscription_expires_at timestamptz;

COMMENT ON COLUMN public.call_center_settings.m365_subscription_id IS
  'Microsoft Graph change notification subscription id for the monitored mailbox.';
COMMENT ON COLUMN public.call_center_settings.m365_subscription_expires_at IS
  'When the Graph subscription expires (renew before this).';

COMMIT;
