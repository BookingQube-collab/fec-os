-- Query performance round 4 (pg_stat_statements / Supabase Query Performance).
--
-- Hot fingerprints after round 3 indexes:
--   1. SELECT attendance_logs (staff_id, location_id, attendance_date) ~640ms mean
--      — listing gap loader was paging every punch row then deduping in JS.
--   2. Similar DISTINCT / punch-day shape ~540ms.
--   3. SELECT attendance_roster_assignments ~12% total_time / 1.5k calls / ~133ms
--      — register + listing + roaming suppress; ORDER BY id alone missed the
--      (location_id|staff_id, work_date) covering indexes; INCLUDE list was short.
--   4. UPDATE attendance_devices SET connection_mode … — app: omit on idle heartbeat.
--
-- This migration: punch-day RPC + widen roster covering indexes to match app ORDER BY.

-- ---------------------------------------------------------------------------
-- Distinct punch days for listing gap fill (one round-trip, not every punch row)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attendance_listing_punch_days(
  p_date_from date,
  p_date_to date,
  p_location_id uuid DEFAULT NULL,
  p_staff_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  staff_id uuid,
  location_id uuid,
  attendance_date date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT
    al.staff_id,
    al.location_id,
    al.attendance_date
  FROM public.attendance_logs al
  WHERE al.staff_id IS NOT NULL
    AND al.attendance_date IS NOT NULL
    AND al.attendance_date >= p_date_from
    AND al.attendance_date <= p_date_to
    AND (p_location_id IS NULL OR al.location_id = p_location_id)
    AND (
      p_staff_ids IS NULL
      OR cardinality(p_staff_ids) = 0
      OR al.staff_id = ANY (p_staff_ids)
    );
$$;

COMMENT ON FUNCTION public.attendance_listing_punch_days(date, date, uuid, uuid[]) IS
  'Distinct mapped punch calendar days for attendance listing gap fill. Prefer over paging every attendance_logs row.';

GRANT EXECUTE ON FUNCTION public.attendance_listing_punch_days(date, date, uuid, uuid[])
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Roster: cover register / listing SELECT + ORDER BY (work_date, staff_id, id)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_attendance_roster_location_work_date;
CREATE INDEX idx_attendance_roster_location_work_date
  ON public.attendance_roster_assignments (location_id, work_date, staff_id, id)
  INCLUDE (shift_template_id, shift_start, shift_end, is_week_off, source, created_at);

DROP INDEX IF EXISTS public.idx_attendance_roster_staff_work_date_inc;
CREATE INDEX idx_attendance_roster_staff_work_date_inc
  ON public.attendance_roster_assignments (staff_id, work_date, id)
  INCLUDE (location_id, is_week_off, shift_template_id, shift_start, shift_end, source);
