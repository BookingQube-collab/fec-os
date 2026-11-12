-- FEC venue queues + AI IVR action for bilingual Main menu template.

BEGIN;

ALTER TABLE public.call_center_ivr_options
  DROP CONSTRAINT IF EXISTS call_center_ivr_options_action_check;

ALTER TABLE public.call_center_ivr_options
  ADD CONSTRAINT call_center_ivr_options_action_check
  CHECK (action IN ('queue', 'voicemail', 'hangup', 'transfer_sip', 'repeat', 'menu', 'agent', 'ai'));

INSERT INTO public.call_center_queues (id, name, strategy, sort_order, wrap_up_seconds, max_wait_seconds, is_active)
VALUES
  ('00000000-0000-4000-8000-0000000000d1', 'InflataPark', 'simultaneous', 10, 30, 120, true),
  ('00000000-0000-4000-8000-0000000000d2', 'Urban Arena', 'simultaneous', 11, 30, 120, true),
  ('00000000-0000-4000-8000-0000000000d3', 'Kids Driving School', 'simultaneous', 12, 30, 120, true),
  ('00000000-0000-4000-8000-0000000000d4', 'Birthday enquiry', 'simultaneous', 13, 30, 120, true)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  is_active = true,
  updated_at = now();

COMMENT ON COLUMN public.call_center_ivr_options.action IS
  'DTMF action: queue | voicemail | hangup | transfer_sip | repeat | menu | agent | ai';

COMMIT;
