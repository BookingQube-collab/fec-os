-- Per-site late punch buffer (minutes) after roster reporting / shift start.
-- NULL keeps shift-template grace_minutes. When set, overrides template grace for late calc.
ALTER TABLE public.attendance_site_settings
  ADD COLUMN IF NOT EXISTS buffer_minutes int;

ALTER TABLE public.attendance_site_settings
  DROP CONSTRAINT IF EXISTS attendance_site_settings_buffer_minutes_chk;

ALTER TABLE public.attendance_site_settings
  ADD CONSTRAINT attendance_site_settings_buffer_minutes_chk
  CHECK (buffer_minutes IS NULL OR (buffer_minutes >= 0 AND buffer_minutes <= 120));

COMMENT ON COLUMN public.attendance_site_settings.buffer_minutes IS
  'Grace minutes after roster reporting time (shift start) before a check-in counts as late. NULL keeps shift-template grace.';
