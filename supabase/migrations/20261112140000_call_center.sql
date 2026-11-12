-- Call Center (Maqsam-like): DIDs, queues, IVR, agent status, CDR.
-- Service-role only. Browser never selects these tables; server actions own access.
-- LiveKit media credentials stay in chat_livekit_settings / LIVEKIT_* env.
-- Telnyx / LiveKit SIP credentials live here as BYO placeholders until keys arrive.

BEGIN;

CREATE TABLE public.call_center_settings (
  id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  ivr_enabled boolean NOT NULL DEFAULT true,
  business_hours_enabled boolean NOT NULL DEFAULT false,
  business_hours_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  timezone text NOT NULL DEFAULT 'Asia/Qatar',
  default_queue_id uuid,
  telnyx_sip_uri text NOT NULL DEFAULT '',
  telnyx_connection_id text NOT NULL DEFAULT '',
  telnyx_api_key text NOT NULL DEFAULT '',
  telnyx_webhook_secret text NOT NULL DEFAULT '',
  livekit_sip_trunk_id text NOT NULL DEFAULT '',
  livekit_sip_dispatch_rule_id text NOT NULL DEFAULT '',
  webhook_shared_secret text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.call_center_settings IS
  'Server-only Call Center / SIP trunk config. No authenticated policies.';

COMMENT ON COLUMN public.call_center_settings.telnyx_api_key IS
  'Telnyx API key. Service role only. Never return full value to the client.';

COMMENT ON COLUMN public.call_center_settings.telnyx_webhook_secret IS
  'Telnyx webhook signing secret. Service role only.';

COMMENT ON COLUMN public.call_center_settings.webhook_shared_secret IS
  'Shared secret for LiveKit SIP / generic inbound webhooks. Service role only.';

INSERT INTO public.call_center_settings (id)
VALUES ('00000000-0000-4000-8000-0000000000cc')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.call_center_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  strategy text NOT NULL DEFAULT 'simultaneous'
    CHECK (strategy IN ('simultaneous', 'round_robin', 'longest_idle')),
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  wrap_up_seconds integer NOT NULL DEFAULT 30 CHECK (wrap_up_seconds >= 0 AND wrap_up_seconds <= 600),
  max_wait_seconds integer NOT NULL DEFAULT 120 CHECK (max_wait_seconds >= 0 AND max_wait_seconds <= 3600),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_call_center_queues_event ON public.call_center_queues (event_id)
  WHERE event_id IS NOT NULL;
CREATE INDEX idx_call_center_queues_active ON public.call_center_queues (is_active, sort_order);

COMMENT ON TABLE public.call_center_queues IS
  'Agent queues for inbound Call Center routing. Optional event_id for event-linked queues.';

CREATE TABLE public.call_center_queue_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL REFERENCES public.call_center_queues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (queue_id, user_id)
);

CREATE INDEX idx_call_center_queue_members_user ON public.call_center_queue_members (user_id)
  WHERE is_active;

COMMENT ON TABLE public.call_center_queue_members IS
  'Queue membership. Lower priority number is preferred when strategy is ordered.';

ALTER TABLE public.call_center_settings
  ADD CONSTRAINT call_center_settings_default_queue_fkey
  FOREIGN KEY (default_queue_id) REFERENCES public.call_center_queues(id) ON DELETE SET NULL;

CREATE TABLE public.call_center_dids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  e164 text NOT NULL,
  label text NOT NULL DEFAULT '',
  queue_id uuid REFERENCES public.call_center_queues(id) ON DELETE SET NULL,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  ivr_menu_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT call_center_dids_e164_unique UNIQUE (e164)
);

CREATE INDEX idx_call_center_dids_queue ON public.call_center_dids (queue_id)
  WHERE is_active;
CREATE INDEX idx_call_center_dids_event ON public.call_center_dids (event_id)
  WHERE event_id IS NOT NULL;

COMMENT ON TABLE public.call_center_dids IS
  'Inbound DIDs (E.164). Map to a queue, optional event, and/or IVR menu.';

CREATE TABLE public.call_center_ivr_menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  greeting_text text NOT NULL DEFAULT '',
  timeout_seconds integer NOT NULL DEFAULT 10 CHECK (timeout_seconds >= 1 AND timeout_seconds <= 60),
  max_retries integer NOT NULL DEFAULT 2 CHECK (max_retries >= 0 AND max_retries <= 5),
  fallback_queue_id uuid REFERENCES public.call_center_queues(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.call_center_ivr_menus IS
  'IVR menus played after DID match when IVR is enabled.';

ALTER TABLE public.call_center_dids
  ADD CONSTRAINT call_center_dids_ivr_menu_fkey
  FOREIGN KEY (ivr_menu_id) REFERENCES public.call_center_ivr_menus(id) ON DELETE SET NULL;

CREATE TABLE public.call_center_ivr_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id uuid NOT NULL REFERENCES public.call_center_ivr_menus(id) ON DELETE CASCADE,
  digit text NOT NULL CHECK (digit ~ '^[0-9*#]$'),
  label text NOT NULL DEFAULT '',
  action text NOT NULL DEFAULT 'queue'
    CHECK (action IN ('queue', 'voicemail', 'hangup', 'transfer_sip', 'repeat')),
  queue_id uuid REFERENCES public.call_center_queues(id) ON DELETE SET NULL,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  transfer_sip_uri text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (menu_id, digit)
);

CREATE INDEX idx_call_center_ivr_options_menu ON public.call_center_ivr_options (menu_id, sort_order);

COMMENT ON TABLE public.call_center_ivr_options IS
  'DTMF digit → action. queue routes to agents; event_id attaches event context to CDR.';

CREATE TABLE public.call_center_agent_status (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'offline'
    CHECK (status IN ('available', 'busy', 'away', 'acw', 'offline')),
  status_since timestamptz NOT NULL DEFAULT now(),
  last_call_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_call_center_agent_status_available
  ON public.call_center_agent_status (status, last_call_at)
  WHERE status = 'available';

COMMENT ON TABLE public.call_center_agent_status IS
  'Softphone presence for Call Center agents.';

CREATE TABLE public.call_center_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL DEFAULT 'inbound'
    CHECK (direction IN ('inbound', 'outbound', 'internal_test')),
  status text NOT NULL DEFAULT 'ringing'
    CHECK (status IN (
      'ringing', 'queued', 'ivr', 'offered', 'answered', 'held',
      'ended', 'missed', 'declined', 'failed', 'voicemail'
    )),
  from_e164 text NOT NULL DEFAULT '',
  to_e164 text NOT NULL DEFAULT '',
  did_id uuid REFERENCES public.call_center_dids(id) ON DELETE SET NULL,
  queue_id uuid REFERENCES public.call_center_queues(id) ON DELETE SET NULL,
  agent_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  ivr_menu_id uuid REFERENCES public.call_center_ivr_menus(id) ON DELETE SET NULL,
  ivr_digit text,
  livekit_room text NOT NULL DEFAULT '',
  provider text NOT NULL DEFAULT 'none'
    CHECK (provider IN ('none', 'telnyx', 'livekit_sip', 'test')),
  provider_call_id text NOT NULL DEFAULT '',
  hangup_reason text NOT NULL DEFAULT '',
  started_at timestamptz NOT NULL DEFAULT now(),
  offered_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_call_center_calls_status_started
  ON public.call_center_calls (status, started_at DESC);
CREATE INDEX idx_call_center_calls_agent
  ON public.call_center_calls (agent_user_id, started_at DESC)
  WHERE agent_user_id IS NOT NULL;
CREATE INDEX idx_call_center_calls_queue
  ON public.call_center_calls (queue_id, started_at DESC)
  WHERE queue_id IS NOT NULL;
CREATE INDEX idx_call_center_calls_event
  ON public.call_center_calls (event_id, started_at DESC)
  WHERE event_id IS NOT NULL;
CREATE INDEX idx_call_center_calls_provider_call
  ON public.call_center_calls (provider, provider_call_id)
  WHERE provider_call_id <> '';

COMMENT ON TABLE public.call_center_calls IS
  'Call detail records (CDR) for Call Center softphone and SIP inbound.';

-- Seed a default queue so admin UI and test ring work before Telnyx arrives.
INSERT INTO public.call_center_queues (id, name, strategy, sort_order)
VALUES ('00000000-0000-4000-8000-0000000000c0', 'General', 'simultaneous', 0)
ON CONFLICT (id) DO NOTHING;

UPDATE public.call_center_settings
SET default_queue_id = '00000000-0000-4000-8000-0000000000c0'
WHERE id = '00000000-0000-4000-8000-0000000000cc'
  AND default_queue_id IS NULL;

INSERT INTO public.call_center_ivr_menus (id, name, greeting_text, fallback_queue_id)
VALUES (
  '00000000-0000-4000-8000-0000000000c1',
  'Main menu',
  'Thank you for calling. Press 1 for general support. Press 2 for events.',
  '00000000-0000-4000-8000-0000000000c0'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.call_center_ivr_options (menu_id, digit, label, action, queue_id, sort_order)
VALUES
  ('00000000-0000-4000-8000-0000000000c1', '1', 'General', 'queue', '00000000-0000-4000-8000-0000000000c0', 0),
  ('00000000-0000-4000-8000-0000000000c1', '2', 'Events', 'queue', '00000000-0000-4000-8000-0000000000c0', 1),
  ('00000000-0000-4000-8000-0000000000c1', '0', 'Repeat', 'repeat', NULL, 9)
ON CONFLICT (menu_id, digit) DO NOTHING;

ALTER TABLE public.call_center_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_center_queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_center_queue_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_center_dids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_center_ivr_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_center_ivr_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_center_agent_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_center_calls ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.call_center_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.call_center_queues FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.call_center_queue_members FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.call_center_dids FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.call_center_ivr_menus FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.call_center_ivr_options FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.call_center_agent_status FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.call_center_calls FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.call_center_settings TO service_role;
GRANT ALL ON TABLE public.call_center_queues TO service_role;
GRANT ALL ON TABLE public.call_center_queue_members TO service_role;
GRANT ALL ON TABLE public.call_center_dids TO service_role;
GRANT ALL ON TABLE public.call_center_ivr_menus TO service_role;
GRANT ALL ON TABLE public.call_center_ivr_options TO service_role;
GRANT ALL ON TABLE public.call_center_agent_status TO service_role;
GRANT ALL ON TABLE public.call_center_calls TO service_role;

COMMIT;
