-- Query performance: listing-gap punch-days fingerprint (authenticated PostgREST).
--
-- Hot query (pg_stat_statements / Supabase Query Performance):
--   SELECT staff_id, location_id, attendance_date
--   FROM attendance_logs
--   WHERE staff_id IS NOT NULL
--     AND attendance_date >= $1 AND attendance_date <= $2
--     AND staff_id = ANY ($3)
--   ORDER BY id ASC
--   LIMIT …
--
-- Prior idx_attendance_logs_staff_attendance_date (staff_id, attendance_date) matches
-- the filter but not ORDER BY id, so plans often Sort after a bitmap heap scan (or
-- walk the PK and filter). Covering (staff_id, attendance_date, id) INCLUDE
-- (location_id) lets an index-ordered scan satisfy filter + order + select list.
-- App order was also updated to staff_id, attendance_date, id to match.

DROP INDEX IF EXISTS public.idx_attendance_logs_staff_attendance_date;
CREATE INDEX idx_attendance_logs_staff_attendance_date
  ON public.attendance_logs (staff_id, attendance_date, id)
  INCLUDE (location_id)
  WHERE staff_id IS NOT NULL AND attendance_date IS NOT NULL;

-- Location-scoped arm of the same gap loader (no staff_id = ANY).
DROP INDEX IF EXISTS public.idx_attendance_logs_location_attendance_date;
CREATE INDEX idx_attendance_logs_location_attendance_date
  ON public.attendance_logs (location_id, attendance_date, id)
  INCLUDE (staff_id)
  WHERE attendance_date IS NOT NULL;
