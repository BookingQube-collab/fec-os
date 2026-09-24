-- Attendance reports listing: All-locations × month filters by work_date without location_id;
-- staff search / gap / flexible merge filter logs by (staff_id, attendance_date).
-- Without these, PostgREST pages scan+ship huge row sets (incl. historical jsonb).

CREATE INDEX IF NOT EXISTS idx_attendance_daily_work_date_location
  ON public.attendance_daily_summary (work_date, location_id);

CREATE INDEX IF NOT EXISTS idx_attendance_daily_staff_work_date
  ON public.attendance_daily_summary (staff_id, work_date)
  WHERE staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_logs_staff_attendance_date
  ON public.attendance_logs (staff_id, attendance_date)
  WHERE staff_id IS NOT NULL AND attendance_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_logs_location_attendance_date
  ON public.attendance_logs (location_id, attendance_date)
  WHERE attendance_date IS NOT NULL;
