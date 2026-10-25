-- Query performance round 3 (pg_stat_statements after ad6c6fc / 20261025120000).
--
-- Still hot after heartbeat throttle + punch batching + escalation */30:
--   1. UPDATE attendance_devices ~7% / 13k calls — app: skip pre-ingest heartbeat
--      on ATTLOG/USER (was double-write), 240s idle window + conditional UPDATE.
--   2. SELECT attendance_logs (staff_id IS NOT NULL, attendance_date range)
--      ~5% / ~158ms — date-leading covering index + app ORDER BY match.
--   3. SELECT attendance_daily_summary ~4% / ~150ms — widen INCLUDE for listing
--      columns (id, device_id, early_leave_minutes).
--   4. SELECT attendance_roster_assignments by location+work_date — no index
--      beyond UNIQUE (staff_id, work_date).
--   5. detect_silent_failures ~1.7% on */15 — overdue early-exit + */30.
--
-- Platform noise (do not "fix" in app SQL): set_config, pg_timezone_names,
-- auth.users last_sign_in_at.

-- ---------------------------------------------------------------------------
-- attendance_logs: mapped punch-days by calendar date (all-sites gap loader)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_attendance_logs_mapped_attendance_date
  ON public.attendance_logs (attendance_date, id)
  INCLUDE (staff_id, location_id)
  WHERE staff_id IS NOT NULL AND attendance_date IS NOT NULL;

-- ---------------------------------------------------------------------------
-- attendance_daily_summary: cover common listing SELECT list
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_attendance_daily_staff_work_date;
CREATE INDEX idx_attendance_daily_staff_work_date
  ON public.attendance_daily_summary (staff_id, work_date)
  INCLUDE (
    id,
    location_id,
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
  )
  WHERE staff_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- attendance_roster_assignments: site + date window (recalc / dashboard)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_attendance_roster_location_work_date
  ON public.attendance_roster_assignments (location_id, work_date)
  INCLUDE (staff_id, is_week_off, shift_template_id);

-- staff_id = ANY + work_date range already uses UNIQUE (staff_id, work_date).
-- Add INCLUDE for common select list on that unique index path via a helper.
CREATE INDEX IF NOT EXISTS idx_attendance_roster_staff_work_date_inc
  ON public.attendance_roster_assignments (staff_id, work_date)
  INCLUDE (location_id, is_week_off, shift_template_id, shift_start, shift_end);

-- ---------------------------------------------------------------------------
-- staff_work_locations: staff_id = ANY lookups (PK is staff_id, location_id —
-- already ideal). Location-leading index exists; nothing else required.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- detect_silent_failures: skip work when no heartbeat is overdue
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.detect_silent_failures()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a record;
  _ticket_id uuid;
  _dt_id uuid;
  _count integer := 0;
  _threshold_ratio numeric := 2.0;
BEGIN
  -- No monitored assets → skip.
  IF NOT EXISTS (
    SELECT 1
    FROM public.assets
    WHERE deleted_at IS NULL
      AND heartbeat_interval_minutes IS NOT NULL
    LIMIT 1
  ) THEN
    RETURN 0;
  END IF;

  -- No overdue heartbeats → skip anti-join + ticket inserts.
  IF NOT EXISTS (
    SELECT 1
    FROM public.assets
    WHERE deleted_at IS NULL
      AND heartbeat_interval_minutes IS NOT NULL
      AND (
        last_heartbeat_at IS NULL
        OR last_heartbeat_at < now()
          - make_interval(mins => GREATEST((heartbeat_interval_minutes * _threshold_ratio)::int, 1))
      )
    LIMIT 1
  ) THEN
    RETURN 0;
  END IF;

  FOR a IN
    SELECT id, location_id, name, tag, heartbeat_interval_minutes, last_heartbeat_at
    FROM public.assets
    WHERE deleted_at IS NULL
      AND heartbeat_interval_minutes IS NOT NULL
      AND (
        last_heartbeat_at IS NULL
        OR last_heartbeat_at < now()
          - make_interval(mins => GREATEST((heartbeat_interval_minutes * _threshold_ratio)::int, 1))
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.downtime_events d
        WHERE d.asset_id = assets.id
          AND d.ended_at IS NULL
          AND d.source = 'silent_failure'
      )
    LIMIT 100
  LOOP
    INSERT INTO public.tickets (location_id, asset_id, title, description, category, priority, status, source)
    VALUES (
      a.location_id,
      a.id,
      'Silent failure: ' || a.name,
      'Asset ' || a.tag || ' has not reported a heartbeat in '
        || COALESCE(EXTRACT(EPOCH FROM (now() - a.last_heartbeat_at)) / 60, 0)::int
        || ' minutes (expected every '
        || a.heartbeat_interval_minutes || ' min).',
      'equipment',
      'high',
      'open',
      'system'
    )
    RETURNING id INTO _ticket_id;

    INSERT INTO public.downtime_events (location_id, asset_id, reason, source, ticket_id)
    VALUES (a.location_id, a.id, 'Silent failure (no heartbeat)', 'silent_failure', _ticket_id)
    RETURNING id INTO _dt_id;

    PERFORM public.log_audit(
      'asset.silent_failure',
      'assets',
      a.id,
      a.location_id,
      NULL,
      jsonb_build_object('ticket_id', _ticket_id, 'downtime_id', _dt_id),
      'heartbeat missed',
      jsonb_build_object('system', true)
    );
    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.detect_silent_failures() TO authenticated, service_role;

-- Heartbeat gaps are typically minutes-to-hours; */30 matches PM / escalation.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fec-silent-failure-sweep') THEN
    PERFORM cron.unschedule('fec-silent-failure-sweep');
  END IF;
  PERFORM cron.schedule(
    'fec-silent-failure-sweep',
    '*/30 * * * *',
    $cron$ SELECT public.detect_silent_failures(); $cron$
  );
END $$;
