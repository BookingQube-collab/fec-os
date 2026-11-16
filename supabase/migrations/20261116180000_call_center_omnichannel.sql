-- Omnichannel foundations: Facebook Messenger + Microsoft 365 email settings,
-- plus a shared channel ticket table for agent-desktop handoffs.
-- Chatbot automation remains in SendPulse; FEC stores contacts/tickets only.

BEGIN;

ALTER TABLE public.call_center_settings
  ADD COLUMN IF NOT EXISTS messenger_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS messenger_page_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS messenger_page_access_token text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS messenger_verify_token text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS m365_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS m365_mailbox text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS m365_tenant_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS m365_client_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS m365_client_secret text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS m365_webhook_client_state text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.call_center_settings.messenger_enabled IS
  'Facebook Messenger agent channel (Meta Page Messaging). Separate from SendPulse chatbot.';
COMMENT ON COLUMN public.call_center_settings.messenger_page_id IS
  'Facebook Page ID for Messenger (may match Instagram page when linked).';
COMMENT ON COLUMN public.call_center_settings.messenger_page_access_token IS
  'Page access token with pages_messaging (or MESSENGER_* / META_PAGE_* env fallback).';
COMMENT ON COLUMN public.call_center_settings.messenger_verify_token IS
  'Webhook verify token for /api/public/meta/messenger (falls back to META_WEBHOOK_VERIFY_TOKEN).';
COMMENT ON COLUMN public.call_center_settings.m365_enabled IS
  'Microsoft 365 / Outlook email channel via Graph.';
COMMENT ON COLUMN public.call_center_settings.m365_mailbox IS
  'Shared mailbox or user UPN monitored for inbound mail.';
COMMENT ON COLUMN public.call_center_settings.m365_tenant_id IS
  'Azure AD tenant ID for client-credentials Graph access.';
COMMENT ON COLUMN public.call_center_settings.m365_client_id IS
  'Azure AD app (client) ID.';
COMMENT ON COLUMN public.call_center_settings.m365_client_secret IS
  'Azure AD app client secret (prefer M365_CLIENT_SECRET env).';
COMMENT ON COLUMN public.call_center_settings.m365_webhook_client_state IS
  'clientState echoed by Graph change notifications for verification.';

CREATE TABLE IF NOT EXISTS public.call_center_omni_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL,
  source text NOT NULL
    CHECK (source IN (
      'sendpulse',
      'facebook_messenger',
      'instagram',
      'microsoft365_email',
      'whatsapp'
    )),
  channel text NOT NULL DEFAULT '',
  event_title text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'pending', 'closed')),
  contact_id uuid REFERENCES public.call_center_contacts(id) ON DELETE SET NULL,
  external_thread_id text NOT NULL DEFAULT '',
  external_message_id text NOT NULL DEFAULT '',
  customer_name text NOT NULL DEFAULT '',
  customer_e164 text NOT NULL DEFAULT '',
  customer_email text NOT NULL DEFAULT '',
  customer_external_id text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  last_message text NOT NULL DEFAULT '',
  assigned_agent_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT call_center_omni_tickets_dedupe_key_unique UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_call_center_omni_tickets_source_status
  ON public.call_center_omni_tickets (source, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_center_omni_tickets_external_thread
  ON public.call_center_omni_tickets (external_thread_id)
  WHERE external_thread_id <> '';

COMMENT ON TABLE public.call_center_omni_tickets IS
  'Omnichannel handoff tickets (Messenger, Instagram, M365 email, etc.). Agent desktop only — chatbot flows stay in SendPulse.';

ALTER TABLE public.call_center_omni_tickets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.call_center_omni_tickets FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.call_center_omni_tickets TO service_role;

COMMIT;
