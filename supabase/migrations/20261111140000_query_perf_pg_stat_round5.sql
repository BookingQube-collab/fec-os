-- Query performance round 5 (pg_stat_statements / Supabase Query Performance).
--
-- Ranked fingerprints from the latest report (prop_total_time):
--   1. WITH pgrst_source SELECT attendance_daily_summary (~10.5%, ~43k calls,
--      ~26ms) — HR listing / My Day / dashboards via PostgREST. App: bypass
--      per-row RLS after capability + scope checks; index below matches
--      location_id + work_date range + ORDER BY work_date DESC, id DESC.
--   2. INSERT attendance_logs … SELECT (~8.8%, ~135ms) — PostgREST multi-row
--      insert shape from ADMS/import batching. Soften by dropping a redundant
--      secondary index that every insert still maintained.
--   3. UPDATE auth.users last_sign_in_at / last_sign_in_ip (supabase_auth_admin,
--      multi-second means) — GoTrue internals. Not fixable in app SQL; see
--      dashboard notes below. No custom UPDATE trigger on auth.users in this
--      repo (only handle_new_user AFTER INSERT).
--   4. SELECT name FROM pg_timezone_names (authenticator, ~67k calls) —
--      PostgREST schema-cache load, not an app query. App validates IANA names
--      in-process (Intl.supportedValuesOf). Dashboard: avoid schema thrash.
--   5. notifications source_type/source_id dedupe counts — covering index.
--
-- Dashboard / DBA (do not attempt destructive resets here):
--   - Reset query stats after deploy to measure: SELECT pg_stat_statements_reset();
--   - Investigate auth.users lock waits (pg_locks / pg_stat_activity) if
--     last_sign_in_* means stay multi-second.
--   - Reduce PostgREST schema reloads (NOTIFY pgrst / Studio DDL churn).

-- ---------------------------------------------------------------------------
-- attendance_daily_summary: site listing (location + date window + order)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_attendance_daily_location_work_date_id
  ON public.attendance_daily_summary (location_id, work_date DESC, id DESC)
  INCLUDE (
    staff_id,
    biometric_user_id,
    device_id,
    status,
    actual_in,
    actual_out,
    late_minutes,
    early_leave_minutes,
    missed_punch,
    punch_count,
    overtime_minutes,
    worked_minutes
  );

-- ---------------------------------------------------------------------------
-- RLS helper: evaluate auth.uid() once (initPlan) per statement
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_can_access_attendance(_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = (SELECT auth.uid())
      AND (
        role_level >= 80
        OR role IN ('hr', 'auditor')
        OR _location_id = ANY (location_ids)
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- attendance_logs inserts: drop redundant staff_id-only index
-- (covered by idx_attendance_logs_staff_punch_at and
--  idx_attendance_logs_staff_attendance_date)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_attendance_logs_staff;

-- ---------------------------------------------------------------------------
-- notifications: HR notify dedupe by source
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notifications_source
  ON public.notifications (source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;
