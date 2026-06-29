
-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  table_name text NOT NULL,
  row_id uuid,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  before jsonb,
  after jsonb,
  reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_table_row ON public.audit_log(table_name, row_id);
CREATE INDEX idx_audit_log_actor ON public.audit_log(actor_id, created_at DESC);
CREATE INDEX idx_audit_log_location ON public.audit_log(location_id, created_at DESC);
CREATE INDEX idx_audit_log_created ON public.audit_log(created_at DESC);

GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Admins + execs read everything
CREATE POLICY "audit_log_admin_read" ON public.audit_log
FOR SELECT TO authenticated
USING (public.current_user_role_level() >= 80);

-- Managers read entries for their locations
CREATE POLICY "audit_log_location_read" ON public.audit_log
FOR SELECT TO authenticated
USING (
  location_id IS NOT NULL
  AND public.user_can_access_location(location_id)
);

-- No app-side INSERT/UPDATE/DELETE policies — only service_role / SECURITY DEFINER fn writes.

-- ============================================================
-- LOG_AUDIT helper (SECURITY DEFINER bypasses RLS for the insert)
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_audit(
  _action text,
  _table_name text,
  _row_id uuid DEFAULT NULL,
  _location_id uuid DEFAULT NULL,
  _before jsonb DEFAULT NULL,
  _after jsonb DEFAULT NULL,
  _reason text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _email text;
BEGIN
  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.audit_log
    (actor_id, actor_email, action, table_name, row_id, location_id, before, after, reason, metadata)
  VALUES
    (auth.uid(), _email, _action, _table_name, _row_id, _location_id, _before, _after, _reason, COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit(text, text, uuid, uuid, jsonb, jsonb, text, jsonb) TO authenticated, service_role;

-- ============================================================
-- SOFT DELETE columns on core business tables
-- ============================================================
ALTER TABLE public.tickets         ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.work_orders     ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.incidents       ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.complaints      ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.staff           ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.assets          ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.bookings        ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tickets_not_deleted         ON public.tickets(id)         WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_work_orders_not_deleted     ON public.work_orders(id)     WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_incidents_not_deleted       ON public.incidents(id)       WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_complaints_not_deleted      ON public.complaints(id)      WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_staff_not_deleted           ON public.staff(id)           WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_not_deleted          ON public.assets(id)          WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_not_deleted ON public.purchase_orders(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_not_deleted        ON public.bookings(id)        WHERE deleted_at IS NULL;

-- ============================================================
-- AGENT ACTIONS (AI agent activity ledger + kill switch foundation)
-- ============================================================
CREATE TYPE public.agent_name AS ENUM (
  'operations','maintenance','revenue','cx','performance','compliance','executive_reporting'
);

CREATE TYPE public.agent_autonomy AS ENUM ('A','B','C');
-- A = read/suggest only, B = act with notify, C = act autonomously

CREATE TYPE public.agent_outcome AS ENUM ('proposed','executed','blocked','failed','skipped');

CREATE TABLE public.agent_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent public.agent_name NOT NULL,
  autonomy public.agent_autonomy NOT NULL DEFAULT 'A',
  action text NOT NULL,
  target_table text,
  target_row_id uuid,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  reasoning text NOT NULL,
  input jsonb DEFAULT '{}'::jsonb,
  output jsonb DEFAULT '{}'::jsonb,
  outcome public.agent_outcome NOT NULL DEFAULT 'proposed',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_actions_agent_created ON public.agent_actions(agent, created_at DESC);
CREATE INDEX idx_agent_actions_location ON public.agent_actions(location_id, created_at DESC);

GRANT SELECT ON public.agent_actions TO authenticated;
GRANT ALL ON public.agent_actions TO service_role;

ALTER TABLE public.agent_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_actions_admin_read" ON public.agent_actions
FOR SELECT TO authenticated
USING (public.current_user_role_level() >= 80);

CREATE POLICY "agent_actions_location_read" ON public.agent_actions
FOR SELECT TO authenticated
USING (
  location_id IS NOT NULL
  AND public.user_can_access_location(location_id)
);

-- Kill switch table (one row per agent)
CREATE TABLE public.agent_settings (
  agent public.agent_name PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  autonomy public.agent_autonomy NOT NULL DEFAULT 'A',
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.agent_settings TO authenticated;
GRANT ALL ON public.agent_settings TO service_role;

ALTER TABLE public.agent_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_settings_read_all" ON public.agent_settings
FOR SELECT TO authenticated USING (true);

CREATE POLICY "agent_settings_admin_write" ON public.agent_settings
FOR ALL TO authenticated
USING (public.current_user_role_level() >= 90)
WITH CHECK (public.current_user_role_level() >= 90);

INSERT INTO public.agent_settings (agent, enabled, autonomy) VALUES
  ('operations', true, 'A'),
  ('maintenance', true, 'A'),
  ('revenue', true, 'A'),
  ('cx', true, 'A'),
  ('performance', true, 'A'),
  ('compliance', true, 'A'),
  ('executive_reporting', true, 'A')
ON CONFLICT (agent) DO NOTHING;
