-- Some staff may check in and check out from their own login.
-- Default false so existing staff stay on the biometric device only.

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS can_self_check_in boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.staff.can_self_check_in IS
  'When true, this person can record a check-in and check-out on attendance_logs from their own login.';

-- One self check-in and one self check-out per person per attendance date.
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_logs_self_check_staff_day_type
  ON public.attendance_logs (staff_id, attendance_date, punch_type)
  WHERE source = 'self_check'
    AND staff_id IS NOT NULL
    AND attendance_date IS NOT NULL
    AND excluded_from_calc = false;

NOTIFY pgrst, 'reload schema';
