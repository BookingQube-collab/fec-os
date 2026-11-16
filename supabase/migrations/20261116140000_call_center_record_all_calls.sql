-- Auto-record every agent-bridged / outbound call via LiveKit egress (default ON).
ALTER TABLE public.call_center_settings
  ADD COLUMN IF NOT EXISTS record_all_calls boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.call_center_settings.record_all_calls IS
  'When true, start LiveKit room composite egress automatically on answer / outbound dial. Manual Record toggle remains an override.';
