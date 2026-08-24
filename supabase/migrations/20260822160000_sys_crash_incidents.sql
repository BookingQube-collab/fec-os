-- ============================================================
-- System Diagnostics & Crash Hub
-- Client/server crash queue, schema inspect, and health ping.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sys_crash_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  message text NOT NULL,
  stack text,
  route text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  severity text NOT NULL DEFAULT 'critical'
    CHECK (severity IN ('info', 'warning', 'critical')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved')),
  source text NOT NULL DEFAULT 'client'
    CHECK (source IN ('client', 'server', 'test', 'heal', 'scan')),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sys_crash_incidents_status_created
  ON public.sys_crash_incidents (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sys_crash_incidents_created
  ON public.sys_crash_incidents (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sys_crash_incidents_user
  ON public.sys_crash_incidents (user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_sys_crash_incidents_updated ON public.sys_crash_incidents;
CREATE TRIGGER trg_sys_crash_incidents_updated
  BEFORE UPDATE ON public.sys_crash_incidents
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.sys_crash_incidents TO authenticated;
GRANT ALL ON public.sys_crash_incidents TO service_role;

ALTER TABLE public.sys_crash_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sys_crash_incidents insert" ON public.sys_crash_incidents;
CREATE POLICY "sys_crash_incidents insert" ON public.sys_crash_incidents
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id IS NULL
    OR user_id = auth.uid()
    OR public.current_user_role_level() >= 80
  );

DROP POLICY IF EXISTS "sys_crash_incidents admin read" ON public.sys_crash_incidents;
CREATE POLICY "sys_crash_incidents admin read" ON public.sys_crash_incidents
  FOR SELECT TO authenticated
  USING (public.current_user_role_level() >= 80);

DROP POLICY IF EXISTS "sys_crash_incidents admin update" ON public.sys_crash_incidents;
CREATE POLICY "sys_crash_incidents admin update" ON public.sys_crash_incidents
  FOR UPDATE TO authenticated
  USING (public.current_user_role_level() >= 80)
  WITH CHECK (public.current_user_role_level() >= 80);

-- Cheap PostgREST/Supabase latency probe
CREATE OR REPLACE FUNCTION public.sys_health_ping()
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT now();
$$;

GRANT EXECUTE ON FUNCTION public.sys_health_ping() TO authenticated, service_role;

-- Curated table existence check (information_schema)
CREATE OR REPLACE FUNCTION public.sys_schema_inspect(_tables text[])
RETURNS TABLE(table_name text, "exists" boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.table_name,
    EXISTS (
      SELECT 1
      FROM information_schema.tables ist
      WHERE ist.table_schema = 'public'
        AND ist.table_name = t.table_name
    ) AS "exists"
  FROM unnest(COALESCE(_tables, ARRAY[]::text[])) AS t(table_name);
$$;

GRANT EXECUTE ON FUNCTION public.sys_schema_inspect(text[]) TO authenticated, service_role;

-- Demo history so an empty hub still has a readable queue (resolved only)
INSERT INTO public.sys_crash_incidents (
  id, message, stack, route, severity, status, source, resolved_at, metadata
) VALUES
  (
    'a1000000-0000-4000-8000-000000000001',
    'ChunkLoadError: Failed to load maintenance route chunk',
    E'ChunkLoadError: Loading chunk app/(protected)/maintenance failed\n    at webpack',
    '/maintenance',
    'warning',
    'resolved',
    'client',
    now() - interval '2 days',
    '{"demo": true}'::jsonb
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    'TypeError: Cannot read properties of undefined (reading ''map'')',
    E'TypeError: Cannot read properties of undefined (reading ''map'')\n    at DashboardKpis',
    '/',
    'critical',
    'resolved',
    'client',
    now() - interval '5 days',
    '{"demo": true}'::jsonb
  )
ON CONFLICT (id) DO NOTHING;
