-- Per-staff daily hours, break, and standing weekly-off (override site defaults for payroll/attendance).
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS expected_hours numeric(4, 2);

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS break_minutes int;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS weekly_off_weekday smallint;

ALTER TABLE public.staff
  DROP CONSTRAINT IF EXISTS staff_expected_hours_chk;
ALTER TABLE public.staff
  ADD CONSTRAINT staff_expected_hours_chk
  CHECK (expected_hours IS NULL OR (expected_hours >= 1 AND expected_hours <= 16));

ALTER TABLE public.staff
  DROP CONSTRAINT IF EXISTS staff_break_minutes_chk;
ALTER TABLE public.staff
  ADD CONSTRAINT staff_break_minutes_chk
  CHECK (break_minutes IS NULL OR (break_minutes >= 0 AND break_minutes <= 240));

ALTER TABLE public.staff
  DROP CONSTRAINT IF EXISTS staff_weekly_off_weekday_chk;
ALTER TABLE public.staff
  ADD CONSTRAINT staff_weekly_off_weekday_chk
  CHECK (weekly_off_weekday IS NULL OR (weekly_off_weekday >= 0 AND weekly_off_weekday <= 6));

COMMENT ON COLUMN public.staff.expected_hours IS
  'Optional daily working hours override for attendance/payroll. NULL = site role hours (permanent/secondment/joker).';
COMMENT ON COLUMN public.staff.break_minutes IS
  'Optional break minutes override. NULL = site attendance_site_settings.break_minutes (or UA 30 / else 60).';
COMMENT ON COLUMN public.staff.weekly_off_weekday IS
  'Standing weekly off weekday (0=Sun..6=Sat, Qatar calendar). Used when no roster row exists for the day; roster is_week_off wins when present.';
