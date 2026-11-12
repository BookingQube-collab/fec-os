-- Expand Call Center toward Maqsam-like modules:
-- AI flags, recording/transfer columns, holidays, campaigns, outbound dial attempts.

BEGIN;

ALTER TABLE public.call_center_settings
  ADD COLUMN IF NOT EXISTS ai_first_answer_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_handoff_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS outbound_caller_id_e164 text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS webhook_outbound_url text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.call_center_settings.ai_first_answer_enabled IS
  'When true, inbound may be offered to LiveKit Agents first (stub until Agents wired).';
COMMENT ON COLUMN public.call_center_settings.ai_handoff_enabled IS
  'When true, AI can escalate to a human queue after first answer.';

ALTER TABLE public.call_center_calls
  ADD COLUMN IF NOT EXISTS recording_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS transfer_type text
    CHECK (transfer_type IS NULL OR transfer_type IN ('cold', 'warm')),
  ADD COLUMN IF NOT EXISTS transfer_target text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS transferred_at timestamptz,
  ADD COLUMN IF NOT EXISTS campaign_id uuid,
  ADD COLUMN IF NOT EXISTS talk_seconds integer
    CHECK (talk_seconds IS NULL OR talk_seconds >= 0);

CREATE INDEX IF NOT EXISTS idx_call_center_calls_campaign
  ON public.call_center_calls (campaign_id, started_at DESC)
  WHERE campaign_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.call_center_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  holiday_date date NOT NULL,
  is_closed boolean NOT NULL DEFAULT true,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (holiday_date)
);

COMMENT ON TABLE public.call_center_holidays IS
  'Closed / special days for business-hours routing.';

CREATE TABLE IF NOT EXISTS public.call_center_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'completed', 'cancelled')),
  caller_id_e164 text NOT NULL DEFAULT '',
  queue_id uuid REFERENCES public.call_center_queues(id) ON DELETE SET NULL,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  script_text text NOT NULL DEFAULT '',
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_center_campaigns_status
  ON public.call_center_campaigns (status, updated_at DESC);

COMMENT ON TABLE public.call_center_campaigns IS
  'Outbound campaign scaffold (manual dial + list). Power dialer later.';

ALTER TABLE public.call_center_calls
  DROP CONSTRAINT IF EXISTS call_center_calls_campaign_id_fkey;
ALTER TABLE public.call_center_calls
  ADD CONSTRAINT call_center_calls_campaign_id_fkey
  FOREIGN KEY (campaign_id) REFERENCES public.call_center_campaigns(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.call_center_campaign_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.call_center_campaigns(id) ON DELETE CASCADE,
  e164 text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'dialing', 'answered', 'no_answer', 'failed', 'skipped', 'completed')),
  last_attempt_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  notes text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_center_campaign_contacts_campaign
  ON public.call_center_campaign_contacts (campaign_id, status);

COMMENT ON TABLE public.call_center_campaign_contacts IS
  'Outbound campaign contact list / dial attempts.';

CREATE TABLE IF NOT EXISTS public.call_center_webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT ARRAY['call.ended']::text[],
  is_active boolean NOT NULL DEFAULT true,
  secret_hint text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.call_center_webhook_endpoints IS
  'Outbound webhook destinations for call events (integrations scaffold).';

-- Default business hours shape when empty (Sun–Thu Qatar office-ish).
UPDATE public.call_center_settings
SET business_hours_json = jsonb_build_object(
  'monday', jsonb_build_object('open', '09:00', 'close', '18:00', 'closed', false),
  'tuesday', jsonb_build_object('open', '09:00', 'close', '18:00', 'closed', false),
  'wednesday', jsonb_build_object('open', '09:00', 'close', '18:00', 'closed', false),
  'thursday', jsonb_build_object('open', '09:00', 'close', '18:00', 'closed', false),
  'friday', jsonb_build_object('open', '09:00', 'close', '13:00', 'closed', false),
  'saturday', jsonb_build_object('open', '00:00', 'close', '00:00', 'closed', true),
  'sunday', jsonb_build_object('open', '09:00', 'close', '18:00', 'closed', false)
)
WHERE id = '00000000-0000-4000-8000-0000000000cc'
  AND (business_hours_json IS NULL OR business_hours_json = '{}'::jsonb);

ALTER TABLE public.call_center_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_center_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_center_campaign_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_center_webhook_endpoints ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.call_center_holidays FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.call_center_campaigns FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.call_center_campaign_contacts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.call_center_webhook_endpoints FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.call_center_holidays TO service_role;
GRANT ALL ON TABLE public.call_center_campaigns TO service_role;
GRANT ALL ON TABLE public.call_center_campaign_contacts TO service_role;
GRANT ALL ON TABLE public.call_center_webhook_endpoints TO service_role;

COMMIT;
