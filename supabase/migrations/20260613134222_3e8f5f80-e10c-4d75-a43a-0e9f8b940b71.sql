
-- ============ assets: heartbeat tracking ============
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS heartbeat_interval_minutes integer,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz;

-- ============ pm_schedules ============
CREATE TABLE IF NOT EXISTS public.pm_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.assets(id) ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'preventive',
  interval_days integer NOT NULL CHECK (interval_days BETWEEN 1 AND 3650),
  next_due_at timestamptz NOT NULL DEFAULT now(),
  last_generated_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_schedules TO authenticated;
GRANT ALL ON public.pm_schedules TO service_role;
ALTER TABLE public.pm_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pm_schedules scoped" ON public.pm_schedules
  FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));
CREATE INDEX IF NOT EXISTS idx_pm_due ON public.pm_schedules (next_due_at) WHERE active;
CREATE TRIGGER trg_pm_updated BEFORE UPDATE ON public.pm_schedules
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ downtime_events ============
CREATE TABLE IF NOT EXISTS public.downtime_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  reason text NOT NULL,
  source text NOT NULL DEFAULT 'manual',  -- manual | silent_failure | ticket
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_minutes integer,
  opened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  work_order_id uuid REFERENCES public.work_orders(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.downtime_events TO authenticated;
GRANT ALL ON public.downtime_events TO service_role;
ALTER TABLE public.downtime_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "downtime scoped" ON public.downtime_events
  FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));
CREATE INDEX IF NOT EXISTS idx_downtime_open ON public.downtime_events (asset_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_downtime_loc_started ON public.downtime_events (location_id, started_at DESC);
CREATE TRIGGER trg_downtime_updated BEFORE UPDATE ON public.downtime_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.downtime_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pm_schedules;

-- ============ RPC: generate_due_pm_work_orders ============
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
    SELECT * FROM public.pm_schedules
    WHERE active AND next_due_at <= now()
    LIMIT 200
  LOOP
    INSERT INTO public.work_orders (location_id, asset_id, title, kind, status, planned_end)
    VALUES (r.location_id, r.asset_id, r.title, r.kind, 'planned', r.next_due_at + (r.interval_days || ' days')::interval)
    RETURNING id INTO _wo_id;

    UPDATE public.pm_schedules
      SET last_generated_at = now(),
          next_due_at = next_due_at + (r.interval_days || ' days')::interval
      WHERE id = r.id;

    PERFORM public.log_audit('pm.work_order_generated', 'work_orders', _wo_id, r.location_id,
      NULL, jsonb_build_object('schedule_id', r.id, 'asset_id', r.asset_id), 'pm sweep',
      jsonb_build_object('system', true));
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END;
$$;

-- ============ RPC: detect_silent_failures ============
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
  _threshold_ratio numeric := 2.0;  -- trip after 2× expected interval
BEGIN
  FOR a IN
    SELECT id, location_id, name, tag, heartbeat_interval_minutes, last_heartbeat_at
    FROM public.assets
    WHERE deleted_at IS NULL
      AND heartbeat_interval_minutes IS NOT NULL
      AND (
        last_heartbeat_at IS NULL
        OR last_heartbeat_at < now() - (heartbeat_interval_minutes * _threshold_ratio || ' minutes')::interval
      )
      -- skip if already an open silent-failure downtime
      AND NOT EXISTS (
        SELECT 1 FROM public.downtime_events d
        WHERE d.asset_id = assets.id AND d.ended_at IS NULL AND d.source = 'silent_failure'
      )
    LIMIT 100
  LOOP
    INSERT INTO public.tickets (location_id, asset_id, title, description, category, priority, status, source)
    VALUES (a.location_id, a.id,
            'Silent failure: ' || a.name,
            'Asset ' || a.tag || ' has not reported a heartbeat in '
              || COALESCE(EXTRACT(EPOCH FROM (now() - a.last_heartbeat_at))/60, 0)::int || ' minutes (expected every '
              || a.heartbeat_interval_minutes || ' min).',
            'equipment', 'high', 'open', 'system')
    RETURNING id INTO _ticket_id;

    INSERT INTO public.downtime_events (location_id, asset_id, reason, source, ticket_id)
    VALUES (a.location_id, a.id, 'Silent failure (no heartbeat)', 'silent_failure', _ticket_id)
    RETURNING id INTO _dt_id;

    PERFORM public.log_audit('asset.silent_failure', 'assets', a.id, a.location_id,
      NULL, jsonb_build_object('ticket_id', _ticket_id, 'downtime_id', _dt_id),
      'heartbeat missed', jsonb_build_object('system', true));
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END;
$$;

-- ============ RPC: start_downtime ============
CREATE OR REPLACE FUNCTION public.start_downtime(
  _location_id uuid,
  _asset_id uuid,
  _reason text,
  _ticket_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  IF NOT public.user_can_access_location(_location_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO public.downtime_events (location_id, asset_id, reason, source, opened_by, ticket_id)
  VALUES (_location_id, _asset_id, _reason, 'manual', auth.uid(), _ticket_id)
  RETURNING id INTO _id;
  PERFORM public.log_audit('downtime.started', 'downtime_events', _id, _location_id,
    NULL, jsonb_build_object('asset_id', _asset_id, 'reason', _reason), _reason, '{}'::jsonb);
  RETURN _id;
END;
$$;

-- ============ RPC: end_downtime ============
CREATE OR REPLACE FUNCTION public.end_downtime(
  _id uuid,
  _notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row record;
  _minutes integer;
BEGIN
  SELECT * INTO _row FROM public.downtime_events WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT public.user_can_access_location(_row.location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _row.ended_at IS NOT NULL THEN RAISE EXCEPTION 'already closed'; END IF;
  _minutes := GREATEST(0, EXTRACT(EPOCH FROM (now() - _row.started_at))/60)::int;
  UPDATE public.downtime_events
    SET ended_at = now(), duration_minutes = _minutes, closed_by = auth.uid(),
        notes = COALESCE(_notes, notes)
    WHERE id = _id;
  PERFORM public.log_audit('downtime.ended', 'downtime_events', _id, _row.location_id,
    to_jsonb(_row), jsonb_build_object('duration_minutes', _minutes), _notes, '{}'::jsonb);
END;
$$;

-- ============ RPC: record_asset_heartbeat ============
CREATE OR REPLACE FUNCTION public.record_asset_heartbeat(_asset_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _loc uuid;
BEGIN
  SELECT location_id INTO _loc FROM public.assets WHERE id = _asset_id;
  IF _loc IS NULL THEN RAISE EXCEPTION 'asset not found'; END IF;
  IF NOT public.user_can_access_location(_loc) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.assets SET last_heartbeat_at = now() WHERE id = _asset_id;

  -- auto-close any open silent-failure downtime for this asset
  UPDATE public.downtime_events
    SET ended_at = now(),
        duration_minutes = GREATEST(0, EXTRACT(EPOCH FROM (now() - started_at))/60)::int,
        closed_by = auth.uid(),
        notes = COALESCE(notes,'') || ' [auto-closed by heartbeat]'
    WHERE asset_id = _asset_id AND ended_at IS NULL AND source = 'silent_failure';
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_due_pm_work_orders() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.detect_silent_failures() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_downtime(uuid,uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_downtime(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_asset_heartbeat(uuid) TO authenticated;

-- ============ cron: every 15 minutes ============
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fec-pm-sweep') THEN
    PERFORM cron.unschedule('fec-pm-sweep');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fec-silent-failure-sweep') THEN
    PERFORM cron.unschedule('fec-silent-failure-sweep');
  END IF;
  PERFORM cron.schedule('fec-pm-sweep', '*/15 * * * *', $cron$ SELECT public.generate_due_pm_work_orders(); $cron$);
  PERFORM cron.schedule('fec-silent-failure-sweep', '*/15 * * * *', $cron$ SELECT public.detect_silent_failures(); $cron$);
END $$;
