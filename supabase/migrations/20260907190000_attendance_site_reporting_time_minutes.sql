-- Per-site reporting window (minutes) after roster shift start (scheduled_in).
-- Combined with buffer_minutes for late punch: on_time_until = roster_start + reporting + buffer.
ALTER TABLE public.attendance_site_settings
  ADD COLUMN IF NOT EXISTS reporting_time_minutes int;

ALTER TABLE public.attendance_site_settings
  DROP CONSTRAINT IF EXISTS attendance_site_settings_reporting_time_minutes_chk;

ALTER TABLE public.attendance_site_settings
  ADD CONSTRAINT attendance_site_settings_reporting_time_minutes_chk
  CHECK (reporting_time_minutes IS NULL OR (reporting_time_minutes >= 0 AND reporting_time_minutes <= 180));

COMMENT ON COLUMN public.attendance_site_settings.reporting_time_minutes IS
  'Minutes after roster start (scheduled_in) that still count as the reporting window. Late uses roster_start + reporting_time_minutes + buffer_minutes. NULL treated as 0 when buffer/reporting policy is applied.';
