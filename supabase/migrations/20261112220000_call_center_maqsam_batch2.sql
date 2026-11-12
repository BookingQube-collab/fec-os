-- Maqsam parity batch 2: phonebook, tags, park orbit, blacklist, extensions, media stubs.

BEGIN;

ALTER TABLE public.call_center_settings
  ADD COLUMN IF NOT EXISTS welcome_greeting text NOT NULL DEFAULT
    'Thank you for calling. Please hold while we connect you.',
  ADD COLUMN IF NOT EXISTS welcome_audio_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS hold_music_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tts_voice text NOT NULL DEFAULT 'en-US-Neural2-A',
  ADD COLUMN IF NOT EXISTS tts_greeting_text text NOT NULL DEFAULT
    'Welcome. Press a digit from the menu or stay on the line.';

COMMENT ON COLUMN public.call_center_settings.welcome_greeting IS
  'Text greeting stub shown / spoken before IVR when no audio URL is set.';
COMMENT ON COLUMN public.call_center_settings.welcome_audio_url IS
  'Optional uploaded/hosted welcome audio URL (stub until Telnyx/LiveKit play).';
COMMENT ON COLUMN public.call_center_settings.hold_music_url IS
  'Optional hold music URL played while a call is held / parked.';
COMMENT ON COLUMN public.call_center_settings.tts_enabled IS
  'When true, TTS greeting text is preferred over static welcome audio (provider later).';

ALTER TABLE public.call_center_calls
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS parked_slot text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS parked_at timestamptz,
  ADD COLUMN IF NOT EXISTS parked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.call_center_calls.tags IS
  'Call tags applied during/after the call (ACW or live).';
COMMENT ON COLUMN public.call_center_calls.parked_slot IS
  'Orbit / park slot label when status is held with park metadata.';

ALTER TABLE public.call_center_agent_status
  ADD COLUMN IF NOT EXISTS extension text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.call_center_agent_status.extension IS
  'Short internal extension for agent-to-agent dial (e.g. 101).';

CREATE TABLE IF NOT EXISTS public.call_center_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL DEFAULT '',
  e164 text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}'::text[],
  is_favorite boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_center_contacts_e164
  ON public.call_center_contacts (e164);
CREATE INDEX IF NOT EXISTS idx_call_center_contacts_name
  ON public.call_center_contacts (display_name);

COMMENT ON TABLE public.call_center_contacts IS
  'Shared phonebook for click-to-call from Call Center.';

CREATE TABLE IF NOT EXISTS public.call_center_tag_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT '#64748b',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.call_center_tag_catalog IS
  'Admin-defined call tags agents can apply to CDRs.';

INSERT INTO public.call_center_tag_catalog (name, color, sort_order)
VALUES
  ('sales', '#0ea5e9', 10),
  ('support', '#22c55e', 20),
  ('billing', '#f59e0b', 30),
  ('complaint', '#ef4444', 40),
  ('vip', '#a855f7', 50),
  ('follow-up', '#64748b', 60)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.call_center_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  e164 text NOT NULL,
  reason text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (e164)
);

CREATE INDEX IF NOT EXISTS idx_call_center_blacklist_active
  ON public.call_center_blacklist (is_active, e164);

COMMENT ON TABLE public.call_center_blacklist IS
  'Blocked numbers — inbound reject / outbound warn.';

ALTER TABLE public.call_center_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_center_tag_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_center_blacklist ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.call_center_contacts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.call_center_tag_catalog FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.call_center_blacklist FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.call_center_contacts TO service_role;
GRANT ALL ON TABLE public.call_center_tag_catalog TO service_role;
GRANT ALL ON TABLE public.call_center_blacklist TO service_role;

COMMIT;
