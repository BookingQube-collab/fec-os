-- Maqsam parity: dispositions, voicemail inbox, recording flag, skills, after-hours routing.

BEGIN;

ALTER TABLE public.call_center_settings
  ADD COLUMN IF NOT EXISTS after_hours_greeting text NOT NULL DEFAULT
    'We are currently closed. Please leave a message or call back during business hours.',
  ADD COLUMN IF NOT EXISTS after_hours_action text NOT NULL DEFAULT 'voicemail'
    CHECK (after_hours_action IN ('voicemail', 'hangup', 'queue'));

COMMENT ON COLUMN public.call_center_settings.after_hours_greeting IS
  'Played / shown when business hours enforcement routes a closed-hours call.';
COMMENT ON COLUMN public.call_center_settings.after_hours_action IS
  'voicemail | hangup | queue — closed-hours inbound handling.';

ALTER TABLE public.call_center_calls
  ADD COLUMN IF NOT EXISTS disposition_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS disposition_notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS recording_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.call_center_calls.disposition_code IS
  'ACW wrap-up code (e.g. resolved, callback, spam).';
COMMENT ON COLUMN public.call_center_calls.recording_enabled IS
  'Agent/supervisor requested recording for this CDR (URL may fill later via LiveKit egress).';

ALTER TABLE public.call_center_queue_members
  ADD COLUMN IF NOT EXISTS skills text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.call_center_queue_members.skills IS
  'Agent skill tags for queue membership (routing hint / wallboard).';

CREATE TABLE IF NOT EXISTS public.call_center_voicemails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid REFERENCES public.call_center_calls(id) ON DELETE SET NULL,
  from_e164 text NOT NULL DEFAULT '',
  to_e164 text NOT NULL DEFAULT '',
  queue_id uuid REFERENCES public.call_center_queues(id) ON DELETE SET NULL,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  prompt_text text NOT NULL DEFAULT '',
  recording_url text NOT NULL DEFAULT '',
  transcript_text text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'listened', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  listened_at timestamptz,
  listened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_call_center_voicemails_status_created
  ON public.call_center_voicemails (status, created_at DESC);

COMMENT ON TABLE public.call_center_voicemails IS
  'Voicemail inbox from IVR / after-hours. recording_url fills when media capture is wired.';

ALTER TABLE public.call_center_voicemails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.call_center_voicemails FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.call_center_voicemails TO service_role;

COMMIT;
