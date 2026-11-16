-- SendPulse → FEC light bridge: handoff tickets for agent desktop.
-- Chatbot automation stays in SendPulse; FEC stores contacts + pick-up tickets.

BEGIN;

CREATE TABLE IF NOT EXISTS public.call_center_sendpulse_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL,
  source text NOT NULL DEFAULT 'sendpulse',
  event_title text NOT NULL DEFAULT '',
  service text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'pending', 'closed')),
  contact_id uuid REFERENCES public.call_center_contacts(id) ON DELETE SET NULL,
  sendpulse_contact_id text NOT NULL DEFAULT '',
  sendpulse_bot_id text NOT NULL DEFAULT '',
  customer_name text NOT NULL DEFAULT '',
  customer_e164 text NOT NULL DEFAULT '',
  customer_email text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  last_message text NOT NULL DEFAULT '',
  whatsapp_conversation_id uuid REFERENCES public.call_center_whatsapp_conversations(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT call_center_sendpulse_tickets_dedupe_key_unique UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_call_center_sendpulse_tickets_status
  ON public.call_center_sendpulse_tickets (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_center_sendpulse_tickets_sp_contact
  ON public.call_center_sendpulse_tickets (sendpulse_contact_id)
  WHERE sendpulse_contact_id <> '';

COMMENT ON TABLE public.call_center_sendpulse_tickets IS
  'SendPulse chatbot bridge tickets (handoff / inbound). Source metadata is always sendpulse; chatbot UI stays in SendPulse.';

ALTER TABLE public.call_center_sendpulse_tickets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.call_center_sendpulse_tickets FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.call_center_sendpulse_tickets TO service_role;

COMMIT;
