-- ============================================================
-- Employee Performance & Recognition — Phase 1 foundation
-- EXTENDS existing KPI engine (does NOT recreate kpi_templates /
-- kpi_template_items / kpi_assignments / kpi_periods / kpi_scores).
-- Links all employee records via public.staff(id).
-- ============================================================

-- ---------- Extend existing KPI template items for scoring ----------
ALTER TABLE public.kpi_templates
  ADD COLUMN IF NOT EXISTS job_role_key text,
  ADD COLUMN IF NOT EXISTS weight_total_pct numeric(5,2) NOT NULL DEFAULT 100;

ALTER TABLE public.kpi_template_items
  ADD COLUMN IF NOT EXISTS higher_is_better boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS target_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS max_cap_pct numeric(5,2) NOT NULL DEFAULT 120;

CREATE INDEX IF NOT EXISTS idx_kpi_templates_job_role ON public.kpi_templates(job_role_key);

-- ---------- Performance settings (rating bands, EOM rules) ----------
CREATE TABLE IF NOT EXISTS public.performance_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Cycles (HR appraisal periods - optional link to kpi_periods) ----------
CREATE TABLE IF NOT EXISTS public.performance_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  period_kind text NOT NULL DEFAULT 'month',
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'closed', 'archived')),
  kpi_period_id uuid REFERENCES public.kpi_periods(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_performance_cycles_dates ON public.performance_cycles(period_start, period_end);

-- ---------- KRA templates ----------
CREATE TABLE IF NOT EXISTS public.kra_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  job_role_key text,
  department text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kra_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.kra_templates(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL,
  description text,
  weight_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (weight_pct >= 0 AND weight_pct <= 100),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, code)
);

-- ---------- Employee KRA / KPI assignments (staff master FK) ----------
CREATE TABLE IF NOT EXISTS public.employee_kras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES public.performance_cycles(id) ON DELETE CASCADE,
  kra_template_item_id uuid REFERENCES public.kra_template_items(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  weight_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (weight_pct >= 0 AND weight_pct <= 100),
  target_text text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled')),
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_kras_staff ON public.employee_kras(staff_id);
CREATE INDEX IF NOT EXISTS idx_employee_kras_cycle ON public.employee_kras(cycle_id);

CREATE TABLE IF NOT EXISTS public.employee_kpis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES public.performance_cycles(id) ON DELETE CASCADE,
  kpi_template_item_id uuid REFERENCES public.kpi_template_items(id) ON DELETE SET NULL,
  kpi_assignment_id uuid REFERENCES public.kpi_assignments(id) ON DELETE SET NULL,
  code text NOT NULL,
  label text NOT NULL,
  weight_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (weight_pct >= 0 AND weight_pct <= 100),
  target_value numeric(12,2),
  unit text,
  higher_is_better boolean NOT NULL DEFAULT true,
  max_cap_pct numeric(5,2) NOT NULL DEFAULT 120,
  data_source text NOT NULL DEFAULT 'manual',
  auto_query_key text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled')),
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, cycle_id, code)
);

CREATE INDEX IF NOT EXISTS idx_employee_kpis_staff ON public.employee_kpis(staff_id);
CREATE INDEX IF NOT EXISTS idx_employee_kpis_cycle ON public.employee_kpis(cycle_id);

-- ---------- KPI actuals (feeds score calc - stubs auto data_source) ----------
CREATE TABLE IF NOT EXISTS public.kpi_actuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_kpi_id uuid NOT NULL REFERENCES public.employee_kpis(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  actual_value numeric(12,2),
  normalized_score numeric(5,2),
  weighted_score numeric(5,2),
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'auto', 'imported')),
  notes text,
  entered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_kpi_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_kpi_actuals_kpi ON public.kpi_actuals(employee_kpi_id);

-- ---------- Evaluations + review workflow ----------
CREATE TABLE IF NOT EXISTS public.employee_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES public.performance_cycles(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'supervisor_review',
      'manager_review',
      'employee_ack',
      'finalized',
      'cancelled'
    )),
  kra_score numeric(5,2),
  kpi_score numeric(5,2),
  total_score numeric(5,2),
  rating_band text,
  supervisor_comments text,
  manager_comments text,
  employee_comments text,
  finalized_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, cycle_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_evaluations_status ON public.employee_evaluations(status);
CREATE INDEX IF NOT EXISTS idx_employee_evaluations_location ON public.employee_evaluations(location_id);

CREATE TABLE IF NOT EXISTS public.evaluation_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES public.employee_evaluations(id) ON DELETE CASCADE,
  from_status text NOT NULL,
  to_status text NOT NULL,
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  comments text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evaluation_reviews_eval ON public.evaluation_reviews(evaluation_id);

-- ---------- Achievements / recognition ----------
CREATE TABLE IF NOT EXISTS public.employee_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  achieved_on date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL DEFAULT 'general',
  points numeric(8,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_achievements_staff ON public.employee_achievements(staff_id);

-- ---------- Nominations + awards (EOM skeleton) ----------
CREATE TABLE IF NOT EXISTS public.employee_nominations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  cycle_id uuid REFERENCES public.performance_cycles(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  award_type text NOT NULL DEFAULT 'employee_of_month',
  nomination_month date NOT NULL,
  rationale text,
  status text NOT NULL DEFAULT 'shortlisted'
    CHECK (status IN ('shortlisted', 'approved', 'rejected', 'withdrawn')),
  nominated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_nominations_month ON public.employee_nominations(nomination_month);
CREATE INDEX IF NOT EXISTS idx_employee_nominations_status ON public.employee_nominations(status);

CREATE TABLE IF NOT EXISTS public.employee_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nomination_id uuid REFERENCES public.employee_nominations(id) ON DELETE SET NULL,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  award_type text NOT NULL DEFAULT 'employee_of_month',
  award_month date NOT NULL,
  title text NOT NULL DEFAULT 'Employee of the Month',
  citation text,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_awards_month ON public.employee_awards(award_month);

-- ---------- Evidence (minimal metadata - storage deferred) ----------
CREATE TABLE IF NOT EXISTS public.performance_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  evaluation_id uuid REFERENCES public.employee_evaluations(id) ON DELETE CASCADE,
  employee_kpi_id uuid REFERENCES public.employee_kpis(id) ON DELETE SET NULL,
  title text NOT NULL,
  notes text,
  file_path text,
  mime_type text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Module audit log ----------
CREATE TABLE IF NOT EXISTS public.performance_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  before jsonb,
  after jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_performance_audit_logs_entity
  ON public.performance_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_performance_audit_logs_created
  ON public.performance_audit_logs(created_at DESC);

-- ---------- PIP stub ----------
CREATE TABLE IF NOT EXISTS public.performance_improvement_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  evaluation_id uuid REFERENCES public.employee_evaluations(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  start_date date,
  end_date date,
  goals text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Grants ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.performance_settings,
  public.performance_cycles,
  public.kra_templates,
  public.kra_template_items,
  public.employee_kras,
  public.employee_kpis,
  public.kpi_actuals,
  public.employee_evaluations,
  public.evaluation_reviews,
  public.employee_achievements,
  public.employee_nominations,
  public.employee_awards,
  public.performance_evidence,
  public.performance_audit_logs,
  public.performance_improvement_plans
TO authenticated;

GRANT ALL ON
  public.performance_settings,
  public.performance_cycles,
  public.kra_templates,
  public.kra_template_items,
  public.employee_kras,
  public.employee_kpis,
  public.kpi_actuals,
  public.employee_evaluations,
  public.evaluation_reviews,
  public.employee_achievements,
  public.employee_nominations,
  public.employee_awards,
  public.performance_evidence,
  public.performance_audit_logs,
  public.performance_improvement_plans
TO service_role;

-- ---------- RLS ----------
ALTER TABLE public.performance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kra_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kra_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_kras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_actuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_nominations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_improvement_plans ENABLE ROW LEVEL SECURITY;

-- Settings: all auth read - HR+ write (>=55)
CREATE POLICY "performance_settings_read" ON public.performance_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "performance_settings_write" ON public.performance_settings
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

-- Cycles / KRA templates: read all - manage via HR level (>=55)
CREATE POLICY "performance_cycles_read" ON public.performance_cycles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "performance_cycles_write" ON public.performance_cycles
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

CREATE POLICY "kra_templates_read" ON public.kra_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "kra_templates_write" ON public.kra_templates
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

CREATE POLICY "kra_template_items_read" ON public.kra_template_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "kra_template_items_write" ON public.kra_template_items
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

-- Staff-linked rows: location scope via staff.location_id
CREATE POLICY "employee_kras_scoped" ON public.employee_kras
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_id AND public.user_can_access_location(s.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_id AND public.user_can_access_location(s.location_id)
    )
  );

CREATE POLICY "employee_kpis_scoped" ON public.employee_kpis
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_id AND public.user_can_access_location(s.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_id AND public.user_can_access_location(s.location_id)
    )
  );

CREATE POLICY "kpi_actuals_via_kpi" ON public.kpi_actuals
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employee_kpis ek
      JOIN public.staff s ON s.id = ek.staff_id
      WHERE ek.id = employee_kpi_id AND public.user_can_access_location(s.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employee_kpis ek
      JOIN public.staff s ON s.id = ek.staff_id
      WHERE ek.id = employee_kpi_id AND public.user_can_access_location(s.location_id)
    )
  );

CREATE POLICY "employee_evaluations_scoped" ON public.employee_evaluations
  FOR ALL TO authenticated
  USING (
    location_id IS NULL OR public.user_can_access_location(location_id)
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_id AND public.user_can_access_location(s.location_id)
    )
  )
  WITH CHECK (
    location_id IS NULL OR public.user_can_access_location(location_id)
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_id AND public.user_can_access_location(s.location_id)
    )
  );

CREATE POLICY "evaluation_reviews_via_eval" ON public.evaluation_reviews
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employee_evaluations e
      WHERE e.id = evaluation_id
        AND (
          e.location_id IS NULL
          OR public.user_can_access_location(e.location_id)
          OR EXISTS (
            SELECT 1 FROM public.staff s
            WHERE s.id = e.staff_id AND public.user_can_access_location(s.location_id)
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employee_evaluations e
      WHERE e.id = evaluation_id
        AND (
          e.location_id IS NULL
          OR public.user_can_access_location(e.location_id)
          OR EXISTS (
            SELECT 1 FROM public.staff s
            WHERE s.id = e.staff_id AND public.user_can_access_location(s.location_id)
          )
        )
    )
  );

CREATE POLICY "employee_achievements_scoped" ON public.employee_achievements
  FOR ALL TO authenticated
  USING (
    location_id IS NULL OR public.user_can_access_location(location_id)
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_id AND public.user_can_access_location(s.location_id)
    )
  )
  WITH CHECK (
    location_id IS NULL OR public.user_can_access_location(location_id)
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_id AND public.user_can_access_location(s.location_id)
    )
  );

CREATE POLICY "employee_nominations_scoped" ON public.employee_nominations
  FOR ALL TO authenticated
  USING (
    location_id IS NULL OR public.user_can_access_location(location_id)
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_id AND public.user_can_access_location(s.location_id)
    )
  )
  WITH CHECK (
    location_id IS NULL OR public.user_can_access_location(location_id)
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_id AND public.user_can_access_location(s.location_id)
    )
  );

CREATE POLICY "employee_awards_scoped" ON public.employee_awards
  FOR ALL TO authenticated
  USING (
    location_id IS NULL OR public.user_can_access_location(location_id)
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_id AND public.user_can_access_location(s.location_id)
    )
  )
  WITH CHECK (
    location_id IS NULL OR public.user_can_access_location(location_id)
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_id AND public.user_can_access_location(s.location_id)
    )
  );

CREATE POLICY "performance_evidence_scoped" ON public.performance_evidence
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_id AND public.user_can_access_location(s.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_id AND public.user_can_access_location(s.location_id)
    )
  );

CREATE POLICY "performance_audit_logs_read" ON public.performance_audit_logs
  FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR (location_id IS NOT NULL AND public.user_can_access_location(location_id))
  );

CREATE POLICY "performance_audit_logs_insert" ON public.performance_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "pip_scoped" ON public.performance_improvement_plans
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_id AND public.user_can_access_location(s.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_id AND public.user_can_access_location(s.location_id)
    )
  );

-- ---------- updated_at triggers ----------
CREATE TRIGGER trg_performance_settings_updated BEFORE UPDATE ON public.performance_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_performance_cycles_updated BEFORE UPDATE ON public.performance_cycles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_kra_templates_updated BEFORE UPDATE ON public.kra_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_employee_kras_updated BEFORE UPDATE ON public.employee_kras
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_employee_kpis_updated BEFORE UPDATE ON public.employee_kpis
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_kpi_actuals_updated BEFORE UPDATE ON public.kpi_actuals
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_employee_evaluations_updated BEFORE UPDATE ON public.employee_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_employee_achievements_updated BEFORE UPDATE ON public.employee_achievements
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_employee_nominations_updated BEFORE UPDATE ON public.employee_nominations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_employee_awards_updated BEFORE UPDATE ON public.employee_awards
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_pip_updated BEFORE UPDATE ON public.performance_improvement_plans
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- Seed settings ----------
INSERT INTO public.performance_settings (key, value, description) VALUES
  (
    'rating_bands',
    '{
      "excellent": {"min": 90, "label": "Excellent"},
      "good": {"min": 80, "label": "Good"},
      "needs_attention": {"min": 70, "label": "Needs Attention"},
      "poor": {"min": 0, "label": "Poor"}
    }'::jsonb,
    'Score → rating band thresholds'
  ),
  (
    'kpi_weightage',
    '{
      "max_total_pct": 100,
      "max_cap_pct": 120,
      "kra_weight_pct": 40,
      "kpi_weight_pct": 60
    }'::jsonb,
    'Default KRA/KPI blend and score cap'
  ),
  (
    'eom_rules',
    '{
      "min_attendance_pct": 95,
      "min_evaluation_score": 85,
      "disallow_open_pip": true,
      "max_consecutive_wins": 2,
      "require_manager_approval": true
    }'::jsonb,
    'Employee of the Month eligibility (Phase 1 constants)'
  )
ON CONFLICT (key) DO NOTHING;

-- ---------- Open performance cycle (current month) ----------
INSERT INTO public.performance_cycles (code, name, period_kind, period_start, period_end, status)
VALUES (
  to_char(CURRENT_DATE, 'YYYY-MM'),
  to_char(CURRENT_DATE, 'FMMonth YYYY') || ' Performance Cycle',
  'month',
  date_trunc('month', CURRENT_DATE)::date,
  (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date,
  'open'
)
ON CONFLICT (code) DO NOTHING;

-- Link cycle to existing kpi_period when present
UPDATE public.performance_cycles c
SET kpi_period_id = p.id
FROM public.kpi_periods p
WHERE c.kpi_period_id IS NULL
  AND p.period_kind = 'month'
  AND p.period_start = c.period_start;

-- ---------- Seed KRA templates (simplified, editable) ----------
INSERT INTO public.kra_templates (code, name, description, job_role_key) VALUES
  ('kra_branch_manager', 'Branch Manager KRAs', 'Leadership & P&L accountability', 'branch_manager'),
  ('kra_duty_manager', 'Duty Manager KRAs', 'Shift ownership & readiness', 'duty_manager'),
  ('kra_supervisor', 'Supervisor KRAs', 'Floor supervision & coaching', 'supervisor'),
  ('kra_cashier', 'Cashier KRAs', 'Cash accuracy & guest throughput', 'cashier'),
  ('kra_guest_relations', 'Guest Relations KRAs', 'CX & complaint recovery', 'guest_relations'),
  ('kra_ride_operator', 'Ride Operator KRAs', 'Safe ride operations', 'ride_operator'),
  ('kra_attraction_operator', 'Attraction Operator KRAs', 'Attraction uptime & safety', 'attraction_operator'),
  ('kra_technician', 'Technician KRAs', 'Maintenance reliability', 'technician'),
  ('kra_housekeeping', 'Housekeeping KRAs', 'Cleanliness & turnaround', 'housekeeping'),
  ('kra_cafe_staff', 'Café Staff KRAs', 'F&B service quality', 'cafe_staff'),
  ('kra_birthday_coordinator', 'Birthday Coordinator KRAs', 'Party delivery excellence', 'birthday_coordinator'),
  ('kra_security', 'Security KRAs', 'Safety & access control', 'security')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.kra_template_items (template_id, code, title, description, weight_pct, sort_order)
SELECT t.id, v.code, v.title, v.description, v.weight_pct, v.sort_order
FROM public.kra_templates t
JOIN (VALUES
  ('kra_branch_manager', 'revenue_accountability', 'Revenue accountability', 'Deliver branch revenue vs target', 30::numeric, 1),
  ('kra_branch_manager', 'people_leadership', 'People leadership', 'Coach and retain branch team', 25::numeric, 2),
  ('kra_branch_manager', 'ops_compliance', 'Ops & compliance', 'Keep branch audit-ready', 25::numeric, 3),
  ('kra_branch_manager', 'guest_experience', 'Guest experience', 'CSAT / complaint recovery', 20::numeric, 4),
  ('kra_duty_manager', 'shift_readiness', 'Shift readiness', 'Opening/closing & handover quality', 30::numeric, 1),
  ('kra_duty_manager', 'team_attendance', 'Team attendance', 'Shift attendance compliance', 25::numeric, 2),
  ('kra_duty_manager', 'issue_followup', 'Issue follow-up', 'Close floor issues same shift', 25::numeric, 3),
  ('kra_duty_manager', 'safety', 'Safety ownership', 'Zero critical safety misses', 20::numeric, 4),
  ('kra_supervisor', 'floor_standards', 'Floor standards', 'Checklist & SOP adherence', 35::numeric, 1),
  ('kra_supervisor', 'coaching', 'Team coaching', 'Coach crew during shift', 35::numeric, 2),
  ('kra_supervisor', 'escalation', 'Escalation quality', 'Timely accurate escalations', 30::numeric, 3),
  ('kra_cashier', 'cash_integrity', 'Cash integrity', 'Zero unexplained variance', 40::numeric, 1),
  ('kra_cashier', 'throughput', 'Guest throughput', 'Queue / transaction speed', 30::numeric, 2),
  ('kra_cashier', 'upsell', 'Upsell contribution', 'Add-on sales contribution', 30::numeric, 3),
  ('kra_guest_relations', 'response_sla', 'Response SLA', 'Complaint first response', 40::numeric, 1),
  ('kra_guest_relations', 'recovery', 'Service recovery', 'Complaint closure quality', 35::numeric, 2),
  ('kra_guest_relations', 'feedback', 'Positive feedback', 'Capture guest compliments', 25::numeric, 3),
  ('kra_ride_operator', 'safety_ops', 'Safe operations', 'Ride safety checklist compliance', 45::numeric, 1),
  ('kra_ride_operator', 'uptime', 'Ride uptime', 'Minimize avoidable downtime', 30::numeric, 2),
  ('kra_ride_operator', 'guest_care', 'Guest care', 'Queue & rider assistance', 25::numeric, 3),
  ('kra_attraction_operator', 'attraction_safety', 'Attraction safety', 'Attraction SOP compliance', 40::numeric, 1),
  ('kra_attraction_operator', 'throughput', 'Guest throughput', 'Session turnaround', 35::numeric, 2),
  ('kra_attraction_operator', 'equipment_care', 'Equipment care', 'Report defects promptly', 25::numeric, 3),
  ('kra_technician', 'pm_discipline', 'PM discipline', 'Complete scheduled PM', 35::numeric, 1),
  ('kra_technician', 'mttr', 'Repair speed', 'Mean time to repair', 35::numeric, 2),
  ('kra_technician', 'repeat_fix', 'Repeat fix quality', 'Reduce repeat failures', 30::numeric, 3),
  ('kra_housekeeping', 'clean_standards', 'Cleanliness standards', 'Zone audit scores', 40::numeric, 1),
  ('kra_housekeeping', 'turnaround', 'Turnaround speed', 'Area readiness after peak', 35::numeric, 2),
  ('kra_housekeeping', 'supplies', 'Supply stewardship', 'Consumable usage discipline', 25::numeric, 3),
  ('kra_cafe_staff', 'service_speed', 'Service speed', 'Order to serve time', 35::numeric, 1),
  ('kra_cafe_staff', 'food_safety', 'Food safety', 'Hygiene checklist compliance', 35::numeric, 2),
  ('kra_cafe_staff', 'upsell', 'Suggestive selling', 'Add-on attachment', 30::numeric, 3),
  ('kra_birthday_coordinator', 'party_delivery', 'Party delivery', 'On-time party execution', 40::numeric, 1),
  ('kra_birthday_coordinator', 'guest_delight', 'Guest delight', 'Party feedback scores', 35::numeric, 2),
  ('kra_birthday_coordinator', 'upsell_packages', 'Package upsell', 'Add-on package attach', 25::numeric, 3),
  ('kra_security', 'access_control', 'Access control', 'Entry/exit compliance', 40::numeric, 1),
  ('kra_security', 'incident_response', 'Incident response', 'Timely incident reporting', 35::numeric, 2),
  ('kra_security', 'patrol', 'Patrol coverage', 'Patrol checklist completion', 25::numeric, 3)
) AS v(template_code, code, title, description, weight_pct, sort_order)
  ON t.code = v.template_code
ON CONFLICT (template_id, code) DO NOTHING;

-- ---------- Seed / extend KPI templates for FEC job roles (reuse engine) ----------
INSERT INTO public.kpi_templates (code, name, description, job_role_key, department, active)
VALUES
  ('perf_branch_manager', 'Branch Manager Scorecard', 'Performance KPI pack — Branch Manager', 'branch_manager', 'Operations', true),
  ('perf_duty_manager', 'Duty Manager Scorecard', 'Performance KPI pack — Duty Manager', 'duty_manager', 'Operations', true),
  ('perf_supervisor', 'Supervisor Scorecard', 'Performance KPI pack — Supervisor', 'supervisor', 'Operations', true),
  ('perf_cashier', 'Cashier Scorecard', 'Performance KPI pack — Cashier', 'cashier', 'Front of House', true),
  ('perf_guest_relations', 'Guest Relations Scorecard', 'Performance KPI pack — Guest Relations', 'guest_relations', 'CX', true),
  ('perf_ride_operator', 'Ride Operator Scorecard', 'Performance KPI pack — Ride Operator', 'ride_operator', 'Attractions', true),
  ('perf_attraction_operator', 'Attraction Operator Scorecard', 'Performance KPI pack — Attraction Operator', 'attraction_operator', 'Attractions', true),
  ('perf_technician', 'Technician Scorecard', 'Performance KPI pack — Technician', 'technician', 'Maintenance', true),
  ('perf_housekeeping', 'Housekeeping Scorecard', 'Performance KPI pack — Housekeeping', 'housekeeping', 'Housekeeping', true),
  ('perf_cafe_staff', 'Café Staff Scorecard', 'Performance KPI pack — Café Staff', 'cafe_staff', 'F&B', true),
  ('perf_birthday_coordinator', 'Birthday Coordinator Scorecard', 'Performance KPI pack — Birthday Coordinator', 'birthday_coordinator', 'Events', true),
  ('perf_security', 'Security Scorecard', 'Performance KPI pack — Security', 'security', 'Security', true)
ON CONFLICT (code) DO UPDATE SET
  job_role_key = EXCLUDED.job_role_key,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  department = EXCLUDED.department,
  active = true;

-- Helper macro-style inserts for KPI items (weights sum to 100)
INSERT INTO public.kpi_template_items (
  template_id, code, label, description, weight, higher_is_better, target_value, unit, max_cap_pct, data_source, auto_query_key, sort_order
)
SELECT t.id, v.code, v.label, v.description, v.weight, v.hib, v.target, v.unit, 120, v.src, v.akey, v.ord
FROM public.kpi_templates t
JOIN (VALUES
  ('perf_branch_manager', 'revenue_achievement', 'Revenue achievement %', 'Branch revenue vs target', 25::numeric, true, 100::numeric, '%', 'auto', 'revenue_target', 1),
  ('perf_branch_manager', 'attendance_compliance', 'Staff attendance %', 'Branch attendance compliance', 15::numeric, true, 95::numeric, '%', 'auto', 'staff_attendance', 2),
  ('perf_branch_manager', 'complaint_rate', 'Complaint rate', 'Complaints per 1k guests (lower better)', 15::numeric, false, 2::numeric, 'count', 'auto', 'complaint_count', 3),
  ('perf_branch_manager', 'ops_health', 'Operational health', 'Ops checklist / health score', 20::numeric, true, 90::numeric, 'score', 'auto', 'operational_health', 4),
  ('perf_branch_manager', 'maintenance_downtime', 'Maintenance downtime hrs', 'Unplanned downtime hours (lower better)', 15::numeric, false, 8::numeric, 'hrs', 'auto', 'maintenance_downtime', 5),
  ('perf_branch_manager', 'people_score', 'People performance', 'Team evaluation average', 10::numeric, true, 80::numeric, 'score', 'manual', NULL, 6),

  ('perf_duty_manager', 'opening_readiness', 'Opening readiness %', 'Opening checklist completion', 20::numeric, true, 100::numeric, '%', 'auto', 'opening_checklist', 1),
  ('perf_duty_manager', 'closing_accuracy', 'Closing accuracy %', 'Closing checklist completion', 15::numeric, true, 100::numeric, '%', 'auto', 'closing_checklist', 2),
  ('perf_duty_manager', 'staff_attendance', 'Shift attendance %', 'Staff attendance on shift', 20::numeric, true, 95::numeric, '%', 'auto', 'staff_attendance', 3),
  ('perf_duty_manager', 'issue_closure', 'Issue closure %', 'Same-shift issue closure', 15::numeric, true, 90::numeric, '%', 'auto', 'issue_closure', 4),
  ('perf_duty_manager', 'revenue_target', 'Shift revenue %', 'Shift revenue vs plan', 20::numeric, true, 100::numeric, '%', 'auto', 'revenue_target', 5),
  ('perf_duty_manager', 'handover', 'Handover completion %', 'Handover quality/completion', 10::numeric, true, 100::numeric, '%', 'auto', 'handover_completion', 6),

  ('perf_supervisor', 'checklist_completion', 'Checklist completion %', 'Floor checklist completion', 30::numeric, true, 100::numeric, '%', 'auto', 'checklist_completion', 1),
  ('perf_supervisor', 'attendance_punctuality', 'Punctuality %', 'Personal punctuality', 20::numeric, true, 98::numeric, '%', 'auto', 'attendance_punctuality', 2),
  ('perf_supervisor', 'coaching_logs', 'Coaching logs', 'Documented coaching moments', 25::numeric, true, 8::numeric, 'count', 'manual', NULL, 3),
  ('perf_supervisor', 'escalations_quality', 'Escalation quality', 'Escalation completeness score', 25::numeric, true, 90::numeric, 'score', 'manual', NULL, 4),

  ('perf_cashier', 'attendance_punctuality', 'Attendance punctuality %', 'On-time clock-ins', 20::numeric, true, 98::numeric, '%', 'auto', 'attendance_punctuality', 1),
  ('perf_cashier', 'cash_accuracy', 'Cash accuracy %', 'Cash variance accuracy', 25::numeric, true, 100::numeric, '%', 'manual', NULL, 2),
  ('perf_cashier', 'upsell_contribution', 'Upsell contribution', 'Add-on sales index', 20::numeric, true, 100::numeric, 'index', 'manual', NULL, 3),
  ('perf_cashier', 'complaint_count', 'Complaint count', 'Complaints attributed (lower better)', 15::numeric, false, 0::numeric, 'count', 'auto', 'complaint_count', 4),
  ('perf_cashier', 'checklist_completion', 'Checklist completion %', 'POS / opening checks', 20::numeric, true, 100::numeric, '%', 'auto', 'checklist_completion', 5),

  ('perf_guest_relations', 'response_time', 'Response time score', 'First response SLA score', 25::numeric, true, 100::numeric, 'score', 'auto', 'complaint_response_time', 1),
  ('perf_guest_relations', 'closure_time', 'Closure time score', 'Complaint closure SLA', 25::numeric, true, 100::numeric, 'score', 'auto', 'complaint_closure_time', 2),
  ('perf_guest_relations', 'satisfaction', 'Satisfaction score', 'Guest satisfaction', 30::numeric, true, 90::numeric, 'score', 'manual', NULL, 3),
  ('perf_guest_relations', 'escalated_count', 'Escalated complaints', 'Escalations (lower better)', 20::numeric, false, 2::numeric, 'count', 'auto', 'escalated_complaints', 4),

  ('perf_ride_operator', 'safety_checklist', 'Safety checklist %', 'Pre-ride safety checks', 35::numeric, true, 100::numeric, '%', 'auto', 'checklist_completion', 1),
  ('perf_ride_operator', 'attendance_punctuality', 'Punctuality %', 'On-time attendance', 20::numeric, true, 98::numeric, '%', 'auto', 'attendance_punctuality', 2),
  ('perf_ride_operator', 'uptime', 'Ride uptime %', 'Available operating time', 25::numeric, true, 95::numeric, '%', 'manual', NULL, 3),
  ('perf_ride_operator', 'guest_incidents', 'Guest incidents', 'Ride incidents (lower better)', 20::numeric, false, 0::numeric, 'count', 'manual', NULL, 4),

  ('perf_attraction_operator', 'safety_checklist', 'Safety checklist %', 'Attraction safety checks', 30::numeric, true, 100::numeric, '%', 'auto', 'checklist_completion', 1),
  ('perf_attraction_operator', 'session_turnaround', 'Session turnaround score', 'Session readiness speed', 25::numeric, true, 90::numeric, 'score', 'manual', NULL, 2),
  ('perf_attraction_operator', 'attendance_punctuality', 'Punctuality %', 'On-time attendance', 20::numeric, true, 98::numeric, '%', 'auto', 'attendance_punctuality', 3),
  ('perf_attraction_operator', 'defect_reports', 'Defect report timeliness', 'Defects logged promptly', 25::numeric, true, 100::numeric, 'score', 'manual', NULL, 4),

  ('perf_technician', 'pm_completion', 'PM completion %', 'Scheduled PM done', 25::numeric, true, 100::numeric, '%', 'auto', 'pm_completion', 1),
  ('perf_technician', 'mttr', 'MTTR score', 'Repair speed score', 20::numeric, true, 90::numeric, 'score', 'auto', 'mttr', 2),
  ('perf_technician', 'breakdown_response', 'Breakdown response', 'Response time score', 20::numeric, true, 90::numeric, 'score', 'auto', 'breakdown_response', 3),
  ('perf_technician', 'repeat_issues', 'Repeat issues', 'Repeat count (lower better)', 15::numeric, false, 1::numeric, 'count', 'auto', 'repeat_issues', 4),
  ('perf_technician', 'asset_uptime', 'Asset uptime %', 'Maintained asset uptime', 20::numeric, true, 95::numeric, '%', 'auto', 'asset_uptime', 5),

  ('perf_housekeeping', 'zone_audit', 'Zone audit score', 'Cleanliness audit', 35::numeric, true, 90::numeric, 'score', 'manual', NULL, 1),
  ('perf_housekeeping', 'attendance_punctuality', 'Punctuality %', 'On-time attendance', 20::numeric, true, 98::numeric, '%', 'auto', 'attendance_punctuality', 2),
  ('perf_housekeeping', 'turnaround', 'Turnaround score', 'Peak recovery speed', 25::numeric, true, 90::numeric, 'score', 'manual', NULL, 3),
  ('perf_housekeeping', 'checklist_completion', 'Checklist %', 'Cleaning checklist', 20::numeric, true, 100::numeric, '%', 'auto', 'checklist_completion', 4),

  ('perf_cafe_staff', 'service_speed', 'Service speed score', 'Order-to-serve', 30::numeric, true, 90::numeric, 'score', 'manual', NULL, 1),
  ('perf_cafe_staff', 'food_safety', 'Food safety %', 'Hygiene checklist', 30::numeric, true, 100::numeric, '%', 'auto', 'checklist_completion', 2),
  ('perf_cafe_staff', 'upsell', 'Upsell index', 'Suggestive selling', 20::numeric, true, 100::numeric, 'index', 'manual', NULL, 3),
  ('perf_cafe_staff', 'attendance_punctuality', 'Punctuality %', 'On-time attendance', 20::numeric, true, 98::numeric, '%', 'auto', 'attendance_punctuality', 4),

  ('perf_birthday_coordinator', 'party_ontime', 'Party on-time %', 'Parties started on schedule', 35::numeric, true, 95::numeric, '%', 'manual', NULL, 1),
  ('perf_birthday_coordinator', 'feedback_score', 'Party feedback score', 'Post-party CSAT', 30::numeric, true, 90::numeric, 'score', 'manual', NULL, 2),
  ('perf_birthday_coordinator', 'package_upsell', 'Package upsell %', 'Add-on attachment', 20::numeric, true, 30::numeric, '%', 'manual', NULL, 3),
  ('perf_birthday_coordinator', 'attendance_punctuality', 'Punctuality %', 'On-time attendance', 15::numeric, true, 98::numeric, '%', 'auto', 'attendance_punctuality', 4),

  ('perf_security', 'access_compliance', 'Access compliance %', 'Entry/exit checks', 30::numeric, true, 100::numeric, '%', 'auto', 'checklist_completion', 1),
  ('perf_security', 'incident_reporting', 'Incident reporting score', 'Timely accurate reports', 30::numeric, true, 90::numeric, 'score', 'manual', NULL, 2),
  ('perf_security', 'patrol_completion', 'Patrol completion %', 'Patrol checklist', 25::numeric, true, 100::numeric, '%', 'auto', 'checklist_completion', 3),
  ('perf_security', 'attendance_punctuality', 'Punctuality %', 'On-time attendance', 15::numeric, true, 98::numeric, '%', 'auto', 'attendance_punctuality', 4)
) AS v(template_code, code, label, description, weight, hib, target, unit, src, akey, ord)
  ON t.code = v.template_code
ON CONFLICT (template_id, code) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  weight = EXCLUDED.weight,
  higher_is_better = EXCLUDED.higher_is_better,
  target_value = EXCLUDED.target_value,
  unit = EXCLUDED.unit,
  max_cap_pct = EXCLUDED.max_cap_pct,
  data_source = EXCLUDED.data_source,
  auto_query_key = EXCLUDED.auto_query_key,
  sort_order = EXCLUDED.sort_order;
