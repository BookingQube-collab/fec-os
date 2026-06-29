-- Daily Operations Module (Step 2): shift briefings, schema extensions, KPI RPC

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.staff_role AS ENUM (
    'venue_supervisor', 'shift_lead', 'crew', 'technician',
    'cashier', 'cleaner', 'security', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.shift_period AS ENUM (
    'morning', 'afternoon', 'evening', 'full_day'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Staff: operational role enum
-- ---------------------------------------------------------------------------
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS staff_role public.staff_role;

-- ---------------------------------------------------------------------------
-- Complaints: handler attribution
-- ---------------------------------------------------------------------------
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS handled_by text;

-- ---------------------------------------------------------------------------
-- Incidents: immediate action at report time
-- ---------------------------------------------------------------------------
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS action_taken text;

-- ---------------------------------------------------------------------------
-- Supervisor issues: resolution date + enriched view
-- ---------------------------------------------------------------------------
ALTER TABLE public.supervisor_issues
  ADD COLUMN IF NOT EXISTS date_resolved date;

CREATE OR REPLACE VIEW public.supervisor_issues_enriched AS
SELECT
  si.*,
  si.log_date AS date_reported,
  COALESCE(si.zone, si.category) AS area_equipment,
  CASE
    WHEN si.date_resolved IS NOT NULL THEN (si.date_resolved - si.log_date)
    ELSE (CURRENT_DATE - si.log_date)
  END AS days_open
FROM public.supervisor_issues si;

GRANT SELECT ON public.supervisor_issues_enriched TO authenticated;
GRANT SELECT ON public.supervisor_issues_enriched TO service_role;

-- ---------------------------------------------------------------------------
-- Shift briefings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shift_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_date date NOT NULL DEFAULT CURRENT_DATE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  shift public.shift_period NOT NULL DEFAULT 'morning',
  supervisor_name text NOT NULL,
  staff_scheduled int NOT NULL DEFAULT 0 CHECK (staff_scheduled >= 0),
  staff_present int NOT NULL DEFAULT 0 CHECK (staff_present >= 0),
  staff_absent int GENERATED ALWAYS AS (GREATEST(staff_scheduled - staff_present, 0)) STORED,
  attendance_pct numeric(5,2) GENERATED ALWAYS AS (
    CASE
      WHEN staff_scheduled > 0
        THEN ROUND((staff_present::numeric / staff_scheduled::numeric) * 100, 2)
      ELSE 0
    END
  ) STORED,
  key_notes text,
  handover_items text,
  filled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (briefing_date, location_id, shift)
);

CREATE INDEX IF NOT EXISTS idx_shift_briefings_location_date
  ON public.shift_briefings (location_id, briefing_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_briefings TO authenticated;
GRANT ALL ON public.shift_briefings TO service_role;

ALTER TABLE public.shift_briefings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shift_briefings scoped" ON public.shift_briefings;
CREATE POLICY "shift_briefings scoped" ON public.shift_briefings FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

DROP TRIGGER IF EXISTS trg_shift_briefings_updated ON public.shift_briefings;
CREATE TRIGGER trg_shift_briefings_updated BEFORE UPDATE ON public.shift_briefings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- Inventory: daily consumables seed
-- ---------------------------------------------------------------------------
INSERT INTO public.inventory_items (sku, name, category, unit, reorder_level, par_level, cost_per_unit) VALUES
  ('CON-GRIP', 'Grip socks (assorted)', 'safety', 'pair', 50, 120, 8.00),
  ('CON-WRIST', 'Entry wristbands', 'operations', 'roll', 15, 40, 22.00),
  ('CON-BANDAID', 'First-aid bandages', 'safety', 'box', 5, 12, 6.50),
  ('CON-SANIT', 'Hand sanitizer refill', 'safety', 'bottle', 8, 20, 14.00),
  ('CON-HELMET', 'Safety helmet liners', 'safety', 'each', 10, 25, 4.00)
ON CONFLICT (sku) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RPC: create incident at report time
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_incident(
  _location_id uuid,
  _occurred_at timestamptz,
  _category text,
  _severity text,
  _summary text,
  _detail text DEFAULT NULL,
  _action_taken text DEFAULT NULL
)
RETURNS uuid
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

  INSERT INTO public.incidents (
    location_id, occurred_at, category, severity, summary, detail,
    action_taken, status, reported_by
  ) VALUES (
    _location_id, _occurred_at, _category, _severity, _summary, _detail,
    _action_taken, 'reported', auth.uid()
  )
  RETURNING id INTO _id;

  PERFORM public.log_audit(
    'incident.created', 'incidents', _id, _location_id, NULL,
    jsonb_build_object('category', _category, 'severity', _severity), NULL, '{}'::jsonb
  );

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_incident(uuid, timestamptz, text, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: daily ops KPIs (portfolio or branch scope)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_daily_ops_kpis(p_location_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'active_employees',
      (SELECT count(*)::int FROM public.staff s
       WHERE s.location_id = ANY(p_location_ids)
         AND s.status = 'active'
         AND s.deleted_at IS NULL),
    'open_incidents',
      (SELECT count(*)::int FROM public.incidents i
       WHERE i.location_id = ANY(p_location_ids)
         AND i.status NOT IN ('closed')),
    'critical_open_incidents',
      (SELECT count(*)::int FROM public.incidents i
       WHERE i.location_id = ANY(p_location_ids)
         AND i.status NOT IN ('closed')
         AND i.severity IN ('critical', 'high')),
    'items_needing_reorder',
      (SELECT count(*)::int
       FROM public.inventory_stock ist
       JOIN public.inventory_items ii ON ii.id = ist.item_id
       WHERE ist.location_id = ANY(p_location_ids)
         AND ii.active = true
         AND ist.quantity_on_hand <= ii.reorder_level),
    'open_maintenance_issues',
      (SELECT count(*)::int FROM public.supervisor_issues si
       WHERE si.location_id = ANY(p_location_ids)
         AND si.status NOT IN ('Closed', 'Verified')),
    'urgent_maintenance_open',
      (SELECT count(*)::int FROM public.supervisor_issues si
       WHERE si.location_id = ANY(p_location_ids)
         AND si.status NOT IN ('Closed', 'Verified')
         AND si.priority IN ('Critical', 'Urgent', 'High')),
    'open_complaints',
      (SELECT count(*)::int FROM public.complaints c
       WHERE c.location_id = ANY(p_location_ids)
         AND c.status NOT IN ('resolved', 'dismissed')),
    'briefings_filed_today',
      (SELECT count(*)::int FROM public.shift_briefings sb
       WHERE sb.location_id = ANY(p_location_ids)
         AND sb.briefing_date = CURRENT_DATE),
    'by_location',
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'code', l.code,
            'name', l.name,
            'location_id', l.id,
            'active_employees',
              (SELECT count(*)::int FROM public.staff s
               WHERE s.location_id = l.id AND s.status = 'active' AND s.deleted_at IS NULL),
            'open_incidents',
              (SELECT count(*)::int FROM public.incidents i
               WHERE i.location_id = l.id AND i.status NOT IN ('closed')),
            'critical_open_incidents',
              (SELECT count(*)::int FROM public.incidents i
               WHERE i.location_id = l.id AND i.status NOT IN ('closed')
                 AND i.severity IN ('critical', 'high')),
            'items_needing_reorder',
              (SELECT count(*)::int
               FROM public.inventory_stock ist
               JOIN public.inventory_items ii ON ii.id = ist.item_id
               WHERE ist.location_id = l.id AND ii.active = true
                 AND ist.quantity_on_hand <= ii.reorder_level),
            'open_maintenance_issues',
              (SELECT count(*)::int FROM public.supervisor_issues si
               WHERE si.location_id = l.id AND si.status NOT IN ('Closed', 'Verified')),
            'urgent_maintenance_open',
              (SELECT count(*)::int FROM public.supervisor_issues si
               WHERE si.location_id = l.id AND si.status NOT IN ('Closed', 'Verified')
                 AND si.priority IN ('Critical', 'Urgent', 'High')),
            'open_complaints',
              (SELECT count(*)::int FROM public.complaints c
               WHERE c.location_id = l.id AND c.status NOT IN ('resolved', 'dismissed')),
            'briefings_filed_today',
              (SELECT count(*)::int FROM public.shift_briefings sb
               WHERE sb.location_id = l.id AND sb.briefing_date = CURRENT_DATE)
          ) ORDER BY l.code
        )
        FROM public.locations l
        WHERE l.status = 'active'
          AND l.id = ANY(p_location_ids)
      ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_ops_kpis(uuid[]) TO authenticated;
