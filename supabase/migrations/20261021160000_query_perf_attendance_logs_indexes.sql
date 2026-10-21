-- Query performance: attendance_logs is the ~700ms PostgREST outlier.
--
-- Hot fingerprints (pg_stat_statements after reset):
--   SELECT … FROM attendance_logs
--     WHERE punch_at >= $1 AND punch_at <= $2
--     ORDER BY punch_at DESC LIMIT …          (~708ms mean, 3 calls)
--   SELECT … WHERE source = $1 AND punch_at … AND location_id = $4
--   SELECT … WHERE staff_id = ANY (…) OR (location_id, biometric_user_id) …
--
-- Existing indexes are (location_id, punch_at) and (staff_id, attendance_date).
-- Unscoped punch_at range + ORDER BY cannot use those leading columns.

-- Global / all-sites punch timeline + "latest punch" LIMIT 1
CREATE INDEX IF NOT EXISTS idx_attendance_logs_punch_at
  ON public.attendance_logs (punch_at DESC);

-- Calendar-day listing without location (getAttendanceHrPunches all-sites)
CREATE INDEX IF NOT EXISTS idx_attendance_logs_attendance_date
  ON public.attendance_logs (attendance_date)
  WHERE attendance_date IS NOT NULL;

-- Device-push listing (source + optional location + punch window)
CREATE INDEX IF NOT EXISTS idx_attendance_logs_source_location_punch
  ON public.attendance_logs (source, location_id, punch_at DESC);

-- Staff-id arm of OR filters used by roster/device-log hydrate
CREATE INDEX IF NOT EXISTS idx_attendance_logs_staff_punch_at
  ON public.attendance_logs (staff_id, punch_at DESC)
  WHERE staff_id IS NOT NULL;

-- Biometric pair arm: (location_id, biometric_user_id) + punch window
CREATE INDEX IF NOT EXISTS idx_attendance_logs_loc_bio_punch
  ON public.attendance_logs (location_id, biometric_user_id, punch_at DESC)
  WHERE biometric_user_id IS NOT NULL;
