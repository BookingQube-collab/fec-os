-- Query performance: SLA / PM / silent-failure sweeps + supporting indexes.
--
-- Dashboard context (Supabase Query Performance):
--   run_escalation_sweep          ~12.5% time, ~33k calls (was every 5 min)
--   detect_silent_failures        ~4% time,   ~11–19k calls
--   generate_due_pm_work_orders   ~2.4% time, ~19k calls
--   cron.job_run_details inserts  ~4.6% time (fewer job runs helps)
--
-- Schedule rationale:
--   fec-escalation-sweep: */5 → */15
--     SLA minutes_after_sla is typically minutes-to-hours; 5-min cadence was ~3×
--     the volume of the 15-min PM/silent jobs and dominated total time. 15-min
--     latency on auto-escalation is acceptable ops-wise.
--   fec-pm-sweep: */15 → */30
--     pm_schedules.interval_days is day-scale (>= 1); half-hour is enough to
--     open due work orders without burning cron + function time.
--   fec-silent-failure-sweep: keep */15 (heartbeat gaps can be short) but make
--     the candidate scan cheap via partial indexes + early exit.
--
-- Out of scope (platform / PostgREST noise — do not "fix" in app SQL):
--   SELECT wal->>… (supabase_admin Realtime)
--   SELECT name FROM pg_timezone_names (authenticator)
--   recursive base-types CTE (authenticator schema introspection)
--   select set_config('search_path', …) (PostgREST per-request)

-- ---------------------------------------------------------------------------
-- Indexes for sweep predicates
-- ---------------------------------------------------------------------------

-- NOT EXISTS (ticket_id, rule_id, level) in run_escalation_sweep
CREATE INDEX IF NOT EXISTS idx_escalations_ticket_rule_level
  ON public.escalations (ticket_id, rule_id, level)
  WHERE ticket_id IS NOT NULL AND rule_id IS NOT NULL;

-- Heartbeat-monitored assets only (detect_silent_failures)
CREATE INDEX IF NOT EXISTS idx_assets_heartbeat_monitor
  ON public.assets (last_heartbeat_at, heartbeat_interval_minutes)
  WHERE deleted_at IS NULL AND heartbeat_interval_minutes IS NOT NULL;

-- Open silent-failure downtime lookup
CREATE INDEX IF NOT EXISTS idx_downtime_silent_open
  ON public.downtime_events (asset_id)
  WHERE ended_at IS NULL AND source = 'silent_failure';

-- Due PM schedules: include columns the generator reads (index-friendly)
DROP INDEX IF EXISTS public.idx_pm_due;
CREATE INDEX idx_pm_due
  ON public.pm_schedules (next_due_at)
  INCLUDE (location_id, asset_id, title, kind, interval_days)
  WHERE active;

-- ---------------------------------------------------------------------------
-- run_escalation_sweep: sargable SLA prefilter + same side effects
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_escalation_sweep()
RETURNS TABLE(escalation_id uuid, ticket_id uuid, rule_id uuid, level integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  new_id uuid;
  new_priority text;
BEGIN
  FOR r IN
    SELECT
      t.id AS tid,
      t.location_id,
      t.priority::text AS priority,
      t.category,
      t.title,
      er.id AS rid,
      er.target_role,
      er.bump_priority,
      er.level AS rlvl,
      er.name AS rname
    FROM public.tickets t
    INNER JOIN public.escalation_rules er
      ON er.enabled = true
     AND (er.location_id IS NULL OR er.location_id = t.location_id)
     AND (er.scope_priority IS NULL OR er.scope_priority = t.priority::text)
     AND (er.scope_category IS NULL OR er.scope_category = t.category)
     AND t.sla_due_at <= (now() - make_interval(mins => GREATEST(er.minutes_after_sla, 0)))
    WHERE t.deleted_at IS NULL
      AND t.status NOT IN ('resolved', 'closed', 'cancelled')
      AND t.sla_due_at IS NOT NULL
      -- Sargable prefilter for idx_tickets_sla_open (minutes_after_sla >= 0)
      AND t.sla_due_at <= now()
      AND NOT EXISTS (
        SELECT 1
        FROM public.escalations e
        WHERE e.ticket_id = t.id
          AND e.rule_id = er.id
          AND e.level = er.level
      )
  LOOP
    INSERT INTO public.escalations
      (location_id, source, source_id, ticket_id, rule_id, level, title, detail, severity, status, due_at)
    VALUES
      (r.location_id, 'ticket', r.tid, r.tid, r.rid, r.rlvl,
       'SLA breach: ' || r.title,
       'Rule "' || r.rname || '" triggered escalation to ' || r.target_role::text,
       CASE WHEN r.priority = 'urgent' THEN 'high' WHEN r.priority = 'high' THEN 'medium' ELSE 'low' END,
       'open',
       now() + interval '2 hours')
    RETURNING id INTO new_id;

    new_priority := NULL;
    IF r.bump_priority THEN
      new_priority := CASE r.priority
        WHEN 'low' THEN 'normal'
        WHEN 'normal' THEN 'high'
        WHEN 'high' THEN 'urgent'
        ELSE 'urgent'
      END;
      UPDATE public.tickets
        SET priority = new_priority::ticket_priority
        WHERE id = r.tid AND priority::text <> 'urgent';
    END IF;

    INSERT INTO public.audit_log (actor_email, action, table_name, row_id, location_id, after, reason)
    VALUES (
      'system@escalation',
      'ticket.escalated',
      'tickets',
      r.tid,
      r.location_id,
      jsonb_build_object('rule', r.rname, 'level', r.rlvl, 'new_priority', new_priority),
      'Auto SLA breach sweep'
    );

    escalation_id := new_id;
    ticket_id := r.tid;
    rule_id := r.rid;
    level := r.rlvl;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_escalation_sweep() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- detect_silent_failures: early exit + make_interval + partial-index-friendly filter
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
  -- No monitored assets → skip the heavier anti-join work entirely.
  IF NOT EXISTS (
    SELECT 1
    FROM public.assets
    WHERE deleted_at IS NULL
      AND heartbeat_interval_minutes IS NOT NULL
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

-- ---------------------------------------------------------------------------
-- generate_due_pm_work_orders: SKIP LOCKED against concurrent API + cron
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_due_pm_work_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  _wo_id uuid;
  _count integer := 0;
BEGIN
  FOR r IN
    SELECT id, location_id, asset_id, title, kind, interval_days, next_due_at
    FROM public.pm_schedules
    WHERE active AND next_due_at <= now()
    ORDER BY next_due_at
    FOR UPDATE SKIP LOCKED
    LIMIT 200
  LOOP
    INSERT INTO public.work_orders (location_id, asset_id, title, kind, status, planned_end)
    VALUES (
      r.location_id,
      r.asset_id,
      r.title,
      r.kind,
      'planned',
      r.next_due_at + make_interval(days => r.interval_days)
    )
    RETURNING id INTO _wo_id;

    UPDATE public.pm_schedules
      SET last_generated_at = now(),
          next_due_at = next_due_at + make_interval(days => r.interval_days)
      WHERE id = r.id;

    PERFORM public.log_audit(
      'pm.work_order_generated',
      'work_orders',
      _wo_id,
      r.location_id,
      NULL,
      jsonb_build_object('schedule_id', r.id, 'asset_id', r.asset_id),
      'pm sweep',
      jsonb_build_object('system', true)
    );
    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_due_pm_work_orders() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Reschedule crons (safer cadence)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fec-escalation-sweep') THEN
    PERFORM cron.unschedule('fec-escalation-sweep');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fec-pm-sweep') THEN
    PERFORM cron.unschedule('fec-pm-sweep');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fec-silent-failure-sweep') THEN
    PERFORM cron.unschedule('fec-silent-failure-sweep');
  END IF;

  PERFORM cron.schedule(
    'fec-escalation-sweep',
    '*/15 * * * *',
    $cron$ SELECT public.run_escalation_sweep(); $cron$
  );
  PERFORM cron.schedule(
    'fec-pm-sweep',
    '*/30 * * * *',
    $cron$ SELECT public.generate_due_pm_work_orders(); $cron$
  );
  PERFORM cron.schedule(
    'fec-silent-failure-sweep',
    '*/15 * * * *',
    $cron$ SELECT public.detect_silent_failures(); $cron$
  );
END $$;
