-- Per-staff flexible reporting / shift times (multi-site + F&B overrides site defaults).
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS flexible_attendance boolean NOT NULL DEFAULT false;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS reporting_time_minutes int;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS buffer_minutes int;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS flexible_shift_start time;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS flexible_shift_end time;

ALTER TABLE public.staff
  DROP CONSTRAINT IF EXISTS staff_reporting_time_minutes_chk;
ALTER TABLE public.staff
  ADD CONSTRAINT staff_reporting_time_minutes_chk
  CHECK (reporting_time_minutes IS NULL OR (reporting_time_minutes >= 0 AND reporting_time_minutes <= 180));

ALTER TABLE public.staff
  DROP CONSTRAINT IF EXISTS staff_buffer_minutes_chk;
ALTER TABLE public.staff
  ADD CONSTRAINT staff_buffer_minutes_chk
  CHECK (buffer_minutes IS NULL OR (buffer_minutes >= 0 AND buffer_minutes <= 120));

COMMENT ON COLUMN public.staff.flexible_attendance IS
  'When true, attendance late/reporting uses this staff reporting_time_minutes / buffer_minutes (and optional flexible shift) instead of site defaults.';
COMMENT ON COLUMN public.staff.reporting_time_minutes IS
  'Minutes before shift start for the reporting clock when flexible_attendance is true. NULL falls back to site setting.';
COMMENT ON COLUMN public.staff.buffer_minutes IS
  'Late buffer after reporting clock when flexible_attendance is true. NULL falls back to site setting.';
COMMENT ON COLUMN public.staff.flexible_shift_start IS
  'Optional default shift start (HH:MM) used for late/reporting when flexible_attendance is true.';
COMMENT ON COLUMN public.staff.flexible_shift_end IS
  'Optional default shift end (HH:MM) paired with flexible_shift_start.';
