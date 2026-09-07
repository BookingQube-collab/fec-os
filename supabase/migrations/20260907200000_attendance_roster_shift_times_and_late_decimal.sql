-- Persist roster shift clock times on assignments (fallback when shift_template_id is null).
-- Store late punch as decimal minutes (one decimal = 6s precision).
ALTER TABLE public.attendance_roster_assignments
  ADD COLUMN IF NOT EXISTS shift_start time,
  ADD COLUMN IF NOT EXISTS shift_end time;

COMMENT ON COLUMN public.attendance_roster_assignments.shift_start IS
  'Roster shift start (Qatar local HH:MM). Used for scheduled_in / reporting time when set.';
COMMENT ON COLUMN public.attendance_roster_assignments.shift_end IS
  'Roster shift end (Qatar local HH:MM).';

-- Backfill from linked templates so listing can show reporting time without re-upload.
UPDATE public.attendance_roster_assignments a
SET
  shift_start = COALESCE(a.shift_start, t.start_time),
  shift_end = COALESCE(a.shift_end, t.end_time)
FROM public.attendance_shift_templates t
WHERE a.shift_template_id = t.id
  AND (a.shift_start IS NULL OR a.shift_end IS NULL);

ALTER TABLE public.attendance_daily_summary
  ALTER COLUMN late_minutes TYPE numeric(8, 1)
  USING ROUND(late_minutes::numeric, 1);

COMMENT ON COLUMN public.attendance_daily_summary.late_minutes IS
  'Minutes past on-time window (roster_start + reporting_time_minutes + buffer_minutes), one decimal.';
