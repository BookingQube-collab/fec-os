-- Agent editor fields, expanded AI Call Agent settings, WhatsApp Cloud API inbox.

BEGIN;

-- ── Agent profile / supervisor flags on presence row ─────────────────────────
ALTER TABLE public.call_center_agent_status
  ADD COLUMN IF NOT EXISTS display_name_override text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS max_concurrent_calls integer NOT NULL DEFAULT 1
    CHECK (max_concurrent_calls >= 1 AND max_concurrent_calls <= 10),
  ADD COLUMN IF NOT EXISTS can_whisper boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_barge boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS skills text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.call_center_agent_status.display_name_override IS
  'Optional Call Center display name; falls back to profiles.display_name.';
COMMENT ON COLUMN public.call_center_agent_status.max_concurrent_calls IS
  'Soft cap for concurrent offered/answered calls (enforced when routing is extended).';
COMMENT ON COLUMN public.call_center_agent_status.can_whisper IS
  'When true, agent may start supervisor whisper on live calls.';
COMMENT ON COLUMN public.call_center_agent_status.can_barge IS
  'When true, agent may barge into live calls.';
COMMENT ON COLUMN public.call_center_agent_status.is_active IS
  'When false, agent is excluded from Call Center routing / performance focus.';
COMMENT ON COLUMN public.call_center_agent_status.skills IS
  'Agent-level skills (also mirrored on queue memberships when editing).';

-- ── AI Call Agent settings (expand existing flags) ───────────────────────────
ALTER TABLE public.call_center_settings
  ADD COLUMN IF NOT EXISTS ai_system_prompt_en text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_system_prompt_ar text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_welcome_en text NOT NULL DEFAULT
    'Hello, thank you for calling. How can I help you today?',
  ADD COLUMN IF NOT EXISTS ai_welcome_ar text NOT NULL DEFAULT
    'مرحباً، شكراً لاتصالك. كيف يمكنني مساعدتك؟',
  ADD COLUMN IF NOT EXISTS ai_provider text NOT NULL DEFAULT 'openai'
    CHECK (ai_provider IN ('openai', 'openai_compatible', 'livekit_agents')),
  ADD COLUMN IF NOT EXISTS ai_model text NOT NULL DEFAULT 'gpt-4o-mini',
  ADD COLUMN IF NOT EXISTS ai_api_key text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_base_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_languages text[] NOT NULL DEFAULT ARRAY['en', 'ar']::text[],
  ADD COLUMN IF NOT EXISTS ai_handoff_after_seconds integer NOT NULL DEFAULT 45
    CHECK (ai_handoff_after_seconds >= 0 AND ai_handoff_after_seconds <= 600),
  ADD COLUMN IF NOT EXISTS ai_handoff_keywords text NOT NULL DEFAULT 'agent,human,representative,مشغل,موظف',
  ADD COLUMN IF NOT EXISTS ai_handoff_queue_id uuid REFERENCES public.call_center_queues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_livekit_agent_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS whatsapp_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS whatsapp_waba_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS whatsapp_access_token text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS whatsapp_verify_token text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.call_center_settings.ai_system_prompt_en IS
  'English system prompt for the AI Call Agent.';
COMMENT ON COLUMN public.call_center_settings.ai_system_prompt_ar IS
  'Arabic system prompt for the AI Call Agent.';
COMMENT ON COLUMN public.call_center_settings.ai_api_key IS
  'Optional OpenAI-compatible API key for Call Center AI. Service role only; never return full value.';
COMMENT ON COLUMN public.call_center_settings.whatsapp_access_token IS
  'Meta WhatsApp Cloud API permanent/user access token. Service role only.';
COMMENT ON COLUMN public.call_center_settings.whatsapp_verify_token IS
  'Webhook verify token expected on GET /api/public/call-center/whatsapp.';

-- ── WhatsApp conversations + messages ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.call_center_whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_id text NOT NULL DEFAULT '',
  customer_e164 text NOT NULL DEFAULT '',
  customer_name text NOT NULL DEFAULT '',
  assigned_agent_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'pending', 'closed')),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_message_preview text NOT NULL DEFAULT '',
  unread_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT call_center_whatsapp_conversations_wa_id_unique UNIQUE (wa_id)
);

CREATE INDEX IF NOT EXISTS idx_cc_wa_conversations_status_last
  ON public.call_center_whatsapp_conversations (status, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.call_center_whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.call_center_whatsapp_conversations(id) ON DELETE CASCADE,
  direction text NOT NULL DEFAULT 'inbound'
    CHECK (direction IN ('inbound', 'outbound')),
  body text NOT NULL DEFAULT '',
  wa_message_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'sent', 'delivered', 'read', 'failed', 'queued')),
  error_text text NOT NULL DEFAULT '',
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cc_wa_messages_conversation_created
  ON public.call_center_whatsapp_messages (conversation_id, created_at ASC);

COMMENT ON TABLE public.call_center_whatsapp_conversations IS
  'WhatsApp Cloud API conversations for Call Center inbox.';
COMMENT ON TABLE public.call_center_whatsapp_messages IS
  'Inbound/outbound WhatsApp messages linked to conversations.';

ALTER TABLE public.call_center_whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_center_whatsapp_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.call_center_whatsapp_conversations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.call_center_whatsapp_messages FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.call_center_whatsapp_conversations TO service_role;
GRANT ALL ON TABLE public.call_center_whatsapp_messages TO service_role;

-- Demo seed so the inbox is not empty before Meta is connected
INSERT INTO public.call_center_whatsapp_conversations (
  id, wa_id, customer_e164, customer_name, status, last_message_at, last_message_preview, unread_count
)
VALUES (
  '00000000-0000-4000-8000-0000000000e1',
  '97455551234',
  '+97455551234',
  'Demo Customer',
  'open',
  now(),
  'Hi — I need help with my booking.',
  1
)
ON CONFLICT (wa_id) DO NOTHING;

INSERT INTO public.call_center_whatsapp_messages (
  id, conversation_id, direction, body, wa_message_id, status, raw_payload
)
SELECT
  '00000000-0000-4000-8000-0000000000e2',
  '00000000-0000-4000-8000-0000000000e1',
  'inbound',
  'Hi — I need help with my booking.',
  'wamid.DEMO_INBOUND_1',
  'received',
  '{"demo": true}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.call_center_whatsapp_messages
  WHERE id = '00000000-0000-4000-8000-0000000000e2'
);

COMMIT;
