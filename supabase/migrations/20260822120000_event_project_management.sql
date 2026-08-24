-- ============================================================
-- Event Project Management — Phase 1–4 foundation
-- Reuses: locations, staff, auth.users, purchase_requisitions.
-- Event IDs: EVT-{YEAR}-{NNNN} via next_evt_number() + evt_settings.
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS public.evt_number_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS public.evt_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  number_prefix text NOT NULL DEFAULT 'EVT',
  number_pad int NOT NULL DEFAULT 4 CHECK (number_pad BETWEEN 3 AND 8),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.evt_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.next_evt_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  n bigint;
  prefix text;
  pad int;
BEGIN
  SELECT COALESCE(number_prefix, 'EVT'), COALESCE(number_pad, 4)
    INTO prefix, pad
  FROM public.evt_settings
  WHERE id = 1;
  IF prefix IS NULL THEN
    prefix := 'EVT';
    pad := 4;
  END IF;
  n := nextval('public.evt_number_seq');
  RETURN prefix || '-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(n::text, pad, '0');
END;
$$;

GRANT USAGE, SELECT ON SEQUENCE public.evt_number_seq TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_evt_number() TO authenticated;

-- ---------- Configurable lookups ----------
CREATE TABLE IF NOT EXISTS public.evt_event_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label_en text NOT NULL,
  label_ar text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.evt_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label_en text NOT NULL,
  label_ar text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.evt_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label_en text NOT NULL,
  label_ar text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_critical boolean NOT NULL DEFAULT false,
  is_terminal boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.evt_stage_gate_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES public.evt_stages(id) ON DELETE CASCADE,
  code text NOT NULL,
  label_en text NOT NULL,
  label_ar text NOT NULL,
  requirement_kind text NOT NULL
    CHECK (requirement_kind IN (
      'scope_baseline', 'budget_approved', 'contract_value', 'deliverables',
      'milestones', 'readiness_min', 'no_open_critical_risks',
      'no_overdue_critical_tasks', 'manual'
    )),
  is_blocking boolean NOT NULL DEFAULT true,
  threshold numeric(8,2),
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (stage_id, code)
);

CREATE TABLE IF NOT EXISTS public.evt_cost_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label_en text NOT NULL,
  label_ar text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

-- ---------- Event master ----------
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_number text UNIQUE,
  name text NOT NULL,
  client_name text,
  venue_name text,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  event_type_id uuid REFERENCES public.evt_event_types(id) ON DELETE SET NULL,
  classification_id uuid REFERENCES public.evt_classifications(id) ON DELETE SET NULL,
  stage_id uuid REFERENCES public.evt_stages(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'on_hold', 'cancelled', 'closed')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  inquiry_date date,
  contract_date date,
  setup_start date,
  setup_end date,
  event_start date,
  event_end date,
  dismantle_date date,
  pm_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  currency text NOT NULL DEFAULT 'QAR',
  contracted_value numeric(14,2),
  health_rag text NOT NULL DEFAULT 'amber'
    CHECK (health_rag IN ('green', 'amber', 'red')),
  health_score numeric(5,2) NOT NULL DEFAULT 0,
  readiness_pct numeric(5,2) NOT NULL DEFAULT 0,
  description text,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_events_location ON public.events (location_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_start ON public.events (event_start) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_stage ON public.events (stage_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_number ON public.events (event_number);
CREATE INDEX IF NOT EXISTS idx_events_pm ON public.events (pm_staff_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.event_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  role_label text NOT NULL DEFAULT 'team',
  is_pm boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (event_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_event_team_event ON public.event_team_members (event_id);

CREATE TABLE IF NOT EXISTS public.event_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  before jsonb,
  after jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_audit_event ON public.event_audit_logs (event_id, created_at DESC);

-- ---------- Scope / WBS / schedule ----------
CREATE TABLE IF NOT EXISTS public.event_scope_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  version_no int NOT NULL DEFAULT 1,
  title text NOT NULL DEFAULT 'Scope',
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_baseline boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (event_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_event_scope_event ON public.event_scope_versions (event_id, version_no DESC);

CREATE TABLE IF NOT EXISTS public.event_deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled')),
  due_date date,
  owner_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  sort_order int NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_event_deliverables_event ON public.event_deliverables (event_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.event_wbs_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.event_wbs_nodes(id) ON DELETE CASCADE,
  node_type text NOT NULL CHECK (node_type IN ('phase', 'workstream', 'task')),
  code text,
  title text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_event_wbs_event ON public.event_wbs_nodes (event_id, sort_order) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.event_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  wbs_id uuid REFERENCES public.event_wbs_nodes(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'blocked', 'completed', 'cancelled')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  start_date date,
  due_date date,
  completed_at timestamptz,
  owner_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  percent_complete int NOT NULL DEFAULT 0 CHECK (percent_complete BETWEEN 0 AND 100),
  is_critical boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_event_tasks_event ON public.event_tasks (event_id, due_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_event_tasks_owner ON public.event_tasks (owner_staff_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.event_task_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  predecessor_id uuid NOT NULL REFERENCES public.event_tasks(id) ON DELETE CASCADE,
  successor_id uuid NOT NULL REFERENCES public.event_tasks(id) ON DELETE CASCADE,
  dep_type text NOT NULL DEFAULT 'FS' CHECK (dep_type IN ('FS', 'SS', 'FF', 'SF')),
  lag_days int NOT NULL DEFAULT 0,
  UNIQUE (predecessor_id, successor_id, dep_type),
  CONSTRAINT event_task_dep_not_self CHECK (predecessor_id <> successor_id)
);

CREATE INDEX IF NOT EXISTS idx_event_task_deps_event ON public.event_task_dependencies (event_id);

CREATE TABLE IF NOT EXISTS public.event_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title text NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'achieved', 'missed')),
  achieved_at timestamptz,
  is_critical boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_milestones_event ON public.event_milestones (event_id, due_date);

CREATE TABLE IF NOT EXISTS public.event_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  baseline_type text NOT NULL CHECK (baseline_type IN ('schedule', 'scope', 'both')),
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_event_baselines_event ON public.event_baselines (event_id, created_at DESC);

-- ---------- Budget ----------
CREATE TABLE IF NOT EXISTS public.event_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE REFERENCES public.events(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'QAR',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'locked')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.event_budget_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES public.event_budgets(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.evt_cost_categories(id) ON DELETE RESTRICT,
  original_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (original_amount >= 0),
  revised_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (revised_amount >= 0),
  committed_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (committed_amount >= 0),
  actual_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (actual_amount >= 0),
  forecast_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (forecast_amount >= 0),
  notes text,
  UNIQUE (budget_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_event_budget_lines_event ON public.event_budget_lines (event_id);

-- ---------- Health inputs (thin — not a full Phase 5 risk module) ----------
CREATE TABLE IF NOT EXISTS public.event_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title text NOT NULL,
  severity text NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'mitigating', 'closed')),
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_event_risks_event ON public.event_risks (event_id, status);

CREATE TABLE IF NOT EXISTS public.event_readiness_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL,
  is_required boolean NOT NULL DEFAULT true,
  is_complete boolean NOT NULL DEFAULT false,
  weight int NOT NULL DEFAULT 10 CHECK (weight > 0),
  completed_at timestamptz,
  UNIQUE (event_id, code)
);

CREATE TABLE IF NOT EXISTS public.event_gate_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES public.evt_stage_gate_requirements(id) ON DELETE CASCADE,
  is_satisfied boolean NOT NULL DEFAULT false,
  satisfied_at timestamptz,
  notes text,
  UNIQUE (event_id, requirement_id)
);

-- Optional PR link — existing rows stay NULL
ALTER TABLE public.purchase_requisitions
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pr_event ON public.purchase_requisitions (event_id)
  WHERE event_id IS NOT NULL;

-- ---------- Triggers ----------
CREATE TRIGGER trg_events_updated BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_event_deliverables_updated BEFORE UPDATE ON public.event_deliverables
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_event_tasks_updated BEFORE UPDATE ON public.event_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_event_milestones_updated BEFORE UPDATE ON public.event_milestones
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_event_budgets_updated BEFORE UPDATE ON public.event_budgets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_evt_settings_updated BEFORE UPDATE ON public.evt_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- Grants + RLS ----------
GRANT SELECT ON
  public.evt_settings, public.evt_event_types, public.evt_classifications,
  public.evt_stages, public.evt_stage_gate_requirements, public.evt_cost_categories
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.events, public.event_team_members, public.event_scope_versions,
  public.event_deliverables, public.event_wbs_nodes, public.event_tasks,
  public.event_task_dependencies, public.event_milestones, public.event_baselines,
  public.event_budgets, public.event_budget_lines, public.event_risks,
  public.event_readiness_items, public.event_gate_completions
TO authenticated;

GRANT SELECT, INSERT ON public.event_audit_logs TO authenticated;

GRANT UPDATE ON public.evt_settings TO authenticated;
GRANT INSERT, UPDATE ON
  public.evt_event_types, public.evt_classifications, public.evt_stages,
  public.evt_stage_gate_requirements, public.evt_cost_categories
TO authenticated;

GRANT ALL ON
  public.evt_settings, public.evt_event_types, public.evt_classifications,
  public.evt_stages, public.evt_stage_gate_requirements, public.evt_cost_categories,
  public.events, public.event_team_members, public.event_audit_logs,
  public.event_scope_versions, public.event_deliverables, public.event_wbs_nodes,
  public.event_tasks, public.event_task_dependencies, public.event_milestones,
  public.event_baselines, public.event_budgets, public.event_budget_lines,
  public.event_risks, public.event_readiness_items, public.event_gate_completions
TO service_role;

ALTER TABLE public.evt_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evt_event_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evt_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evt_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evt_stage_gate_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evt_cost_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_scope_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_wbs_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_readiness_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_gate_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evt_lookups_read" ON public.evt_event_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "evt_class_read" ON public.evt_classifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "evt_stages_read" ON public.evt_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "evt_gates_read" ON public.evt_stage_gate_requirements FOR SELECT TO authenticated USING (true);
CREATE POLICY "evt_cats_read" ON public.evt_cost_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "evt_settings_read" ON public.evt_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "evt_lookups_write_exec" ON public.evt_event_types FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 80)
  WITH CHECK (public.current_user_role_level() >= 80);
CREATE POLICY "evt_class_write_exec" ON public.evt_classifications FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 80)
  WITH CHECK (public.current_user_role_level() >= 80);
CREATE POLICY "evt_stages_write_exec" ON public.evt_stages FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 80)
  WITH CHECK (public.current_user_role_level() >= 80);
CREATE POLICY "evt_gates_write_exec" ON public.evt_stage_gate_requirements FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 80)
  WITH CHECK (public.current_user_role_level() >= 80);
CREATE POLICY "evt_cats_write_exec" ON public.evt_cost_categories FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 80)
  WITH CHECK (public.current_user_role_level() >= 80);
CREATE POLICY "evt_settings_write_exec" ON public.evt_settings FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 80)
  WITH CHECK (public.current_user_role_level() >= 80);

CREATE POLICY "events_scoped" ON public.events FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

CREATE POLICY "event_children_team" ON public.event_team_members FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_id AND public.user_can_access_location(e.location_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_id AND public.user_can_access_location(e.location_id)
  ));

CREATE POLICY "event_audit_read" ON public.event_audit_logs FOR SELECT TO authenticated
  USING (location_id IS NULL OR public.user_can_access_location(location_id));
CREATE POLICY "event_audit_insert" ON public.event_audit_logs FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "event_children_scope" ON public.event_scope_versions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)));

CREATE POLICY "event_children_deliverables" ON public.event_deliverables FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)));

CREATE POLICY "event_children_wbs" ON public.event_wbs_nodes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)));

CREATE POLICY "event_children_tasks" ON public.event_tasks FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)));

CREATE POLICY "event_children_deps" ON public.event_task_dependencies FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)));

CREATE POLICY "event_children_milestones" ON public.event_milestones FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)));

CREATE POLICY "event_children_baselines" ON public.event_baselines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)));

CREATE POLICY "event_children_budgets" ON public.event_budgets FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)));

CREATE POLICY "event_children_budget_lines" ON public.event_budget_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)));

CREATE POLICY "event_children_risks" ON public.event_risks FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)));

CREATE POLICY "event_children_readiness" ON public.event_readiness_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)));

CREATE POLICY "event_children_gates" ON public.event_gate_completions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)));

-- ---------- Seed lookups ----------
INSERT INTO public.evt_event_types (code, label_en, label_ar, sort_order) VALUES
  ('festival', 'Festival', 'مهرجان', 1),
  ('mall_activation', 'Mall activation', 'تفعيل مول', 2),
  ('school', 'School event', 'فعالية مدرسية', 3),
  ('corporate', 'Corporate', 'شركات', 4),
  ('private', 'Private event', 'فعالية خاصة', 5),
  ('seasonal', 'Seasonal campaign', 'حملة موسمية', 6),
  ('brand_activation', 'Brand activation', 'تفعيل علامة', 7),
  ('community', 'Community event', 'فعالية مجتمعية', 8)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.evt_classifications (code, label_en, label_ar, sort_order) VALUES
  ('client', 'Client / external', 'عميل / خارجي', 1),
  ('internal', 'Internal', 'داخلي', 2),
  ('partnership', 'Partnership', 'شراكة', 3),
  ('sponsorship', 'Sponsorship', 'رعاية', 4)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.evt_stages (code, label_en, label_ar, sort_order, is_critical, is_terminal) VALUES
  ('inquiry', 'Inquiry', 'استفسار', 1, false, false),
  ('proposal', 'Proposal', 'عرض سعر', 2, false, false),
  ('contracted', 'Contracted', 'متعاقد', 3, false, false),
  ('pre_production', 'Pre-Production', 'ما قبل الإنتاج', 4, true, false),
  ('setup', 'Setup', 'تركيب', 5, true, false),
  ('live', 'Live', 'أيام الفعالية', 6, true, false),
  ('dismantle', 'Dismantle', 'فك', 7, true, false),
  ('closed', 'Closed', 'مغلق', 8, false, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.evt_cost_categories (code, label_en, label_ar, sort_order) VALUES
  ('labor', 'Labor / crew', 'العمالة / الطاقم', 1),
  ('equipment', 'Equipment rental', 'تأجير المعدات', 2),
  ('decor', 'Decor & theming', 'الديكور والثيم', 3),
  ('transport', 'Transport & logistics', 'النقل واللوجستيات', 4),
  ('permits', 'Permits & compliance', 'التصاريح والامتثال', 5),
  ('venue', 'Venue / space', 'الموقع / المساحة', 6),
  ('marketing', 'Marketing & print', 'التسويق والطباعة', 7),
  ('fnb', 'F&B', 'الأغذية والمشروبات', 8),
  ('talent', 'Entertainment / talent', 'الترفيه / المواهب', 9),
  ('insurance', 'Insurance', 'التأمين', 10),
  ('contingency', 'Contingency', 'احتياطي', 11),
  ('other', 'Other', 'أخرى', 12)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.evt_stage_gate_requirements (
  stage_id, code, label_en, label_ar, requirement_kind, is_blocking, threshold, sort_order
)
SELECT s.id, v.code, v.label_en, v.label_ar, v.kind, true, v.threshold, v.sort_order
FROM public.evt_stages s
JOIN (VALUES
  ('proposal', 'contract_value', 'Contract value entered', 'قيمة العقد مدخلة', 'contract_value', NULL::numeric, 1),
  ('contracted', 'contract_value', 'Contract value entered', 'قيمة العقد مدخلة', 'contract_value', NULL, 1),
  ('contracted', 'budget_approved', 'Budget approved', 'الميزانية معتمدة', 'budget_approved', NULL, 2),
  ('pre_production', 'scope_baseline', 'Scope baseline saved', 'خط أساس النطاق محفوظ', 'scope_baseline', NULL, 1),
  ('pre_production', 'no_overdue_critical', 'No overdue critical tasks', 'لا مهام حرجة متأخرة', 'no_overdue_critical_tasks', NULL, 2),
  ('pre_production', 'readiness_min', 'Readiness at least 70%', 'الجاهزية 70٪ على الأقل', 'readiness_min', 70, 3),
  ('setup', 'no_overdue_critical', 'No overdue critical tasks', 'لا مهام حرجة متأخرة', 'no_overdue_critical_tasks', NULL, 1),
  ('dismantle', 'no_open_critical_risks', 'No open critical risks', 'لا مخاطر حرجة مفتوحة', 'no_open_critical_risks', NULL, 1)
) AS v(stage_code, code, label_en, label_ar, kind, threshold, sort_order)
  ON s.code = v.stage_code
ON CONFLICT (stage_id, code) DO NOTHING;
