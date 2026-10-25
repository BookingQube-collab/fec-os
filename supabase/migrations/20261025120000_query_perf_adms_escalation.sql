-- Query performance round 2 (pg_stat_statements since 2026-10-21 reset).
--
-- Ranked hot paths (service_role / postgres):
--   1. UPDATE attendance_devices (ADMS idle heartbeat) ~12% — app: DB-seeded
--      throttle + 180s interval (adms-http / constants).
--   2. INSERT attendance_logs (per-row ADMS / import) ~9–15% — app: batched
--      insertAttendancePunchRows + scoped planAdmsRecalc.
--   3. SELECT name FROM pg_timezone_names (authenticator) ~8% — PostgREST
--      schema-cache load; NOT fixable in app SQL. Dashboard: avoid frequent
--      schema reloads / API schema thrash.
--   4. run_escalation_sweep ~7% / ~62ms mean — early exit + */30 below.
--   5. SELECT attendance_daily_summary (authenticated) ~5% / ~150ms — covering
--      index for staff_id = ANY + work_date range listing.
--
-- Recursive base-types CTE (authenticator) is PostgREST introspection noise.

-- ---------------------------------------------------------------------------
-- attendance_daily_summary: staff + date listing (HR / reports / My Day)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_attendance_daily_staff_work_date;
CREATE INDEX idx_attendance_daily_staff_work_date
  ON public.attendance_daily_summary (staff_id, work_date)
  INCLUDE (
    location_id,
    biometric_user_id,
    status,
    actual_in,
    actual_out,
    late_minutes,
    missed_punch,
    punch_count,
    overtime_minutes,
    worked_minutes
  )
  WHERE staff_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- run_escalation_sweep: skip join work when nothing is SLA-overdue
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
  -- Cheap prefilter on idx_tickets_sla_open before joining escalation_rules.
  IF NOT EXISTS (
    SELECT 1
    FROM public.tickets t
    WHERE t.deleted_at IS NULL
      AND t.status NOT IN ('resolved', 'closed', 'cancelled')
      AND t.sla_due_at IS NOT NULL
      AND t.sla_due_at <= now()
    LIMIT 1
  ) THEN
    RETURN;
  END IF;

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

-- SLA minutes_after_sla is typically minutes-to-hours; */30 is enough after the
-- earlier */5 → */15 cut. Keeps mean latency acceptable for ops.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fec-escalation-sweep') THEN
    PERFORM cron.unschedule('fec-escalation-sweep');
  END IF;
  PERFORM cron.schedule(
    'fec-escalation-sweep',
    '*/30 * * * *',
    $cron$ SELECT public.run_escalation_sweep(); $cron$
  );
END $$;
