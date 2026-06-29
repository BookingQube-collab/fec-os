-- ============================================================
-- Sprint 1: Extended roles, KPI engine foundation
-- ============================================================

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'hr';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'customer_service';

-- KPI templates (role-based scorecards)
CREATE TABLE public.kpi_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  target_role public.app_role,
  department text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.kpi_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.kpi_templates(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  description text,
  weight numeric(5,2) NOT NULL DEFAULT 1 CHECK (weight > 0),
  data_source text NOT NULL DEFAULT 'manual',
  auto_query_key text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, code)
);

CREATE TABLE public.kpi_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.kpi_templates(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.staff(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  department text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (staff_id IS NOT NULL OR user_id IS NOT NULL OR location_id IS NOT NULL OR department IS NOT NULL)
);

CREATE TABLE public.kpi_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_kind text NOT NULL DEFAULT 'month',
  period_start date NOT NULL,
  period_end date NOT NULL,
  label text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_kind, period_start)
);

CREATE TABLE public.kpi_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.kpi_assignments(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.kpi_periods(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  total_score numeric(5,2) NOT NULL DEFAULT 0,
  rating text,
  calculated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, period_id)
);

CREATE TABLE public.kpi_score_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  score_id uuid NOT NULL REFERENCES public.kpi_scores(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.kpi_template_items(id) ON DELETE CASCADE,
  raw_value numeric(10,2),
  normalized_score numeric(5,2) NOT NULL DEFAULT 0,
  weighted_score numeric(5,2) NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',
  notes text,
  entered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (score_id, item_id)
);

CREATE INDEX idx_kpi_templates_role ON public.kpi_templates(target_role);
CREATE INDEX idx_kpi_assignments_location ON public.kpi_assignments(location_id);
CREATE INDEX idx_kpi_scores_period ON public.kpi_scores(period_id);
CREATE INDEX idx_kpi_scores_location ON public.kpi_scores(location_id);

-- RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_template_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_periods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_scores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_score_details TO authenticated;
GRANT ALL ON public.kpi_templates, public.kpi_template_items, public.kpi_assignments,
  public.kpi_periods, public.kpi_scores, public.kpi_score_details TO service_role;

ALTER TABLE public.kpi_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_score_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_templates read" ON public.kpi_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "kpi_templates write" ON public.kpi_templates FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 80)
  WITH CHECK (public.current_user_role_level() >= 80);

CREATE POLICY "kpi_template_items read" ON public.kpi_template_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "kpi_template_items write" ON public.kpi_template_items FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 80)
  WITH CHECK (public.current_user_role_level() >= 80);

CREATE POLICY "kpi_assignments scoped" ON public.kpi_assignments FOR ALL TO authenticated
  USING (location_id IS NULL OR public.user_can_access_location(location_id))
  WITH CHECK (location_id IS NULL OR public.user_can_access_location(location_id));

CREATE POLICY "kpi_periods read" ON public.kpi_periods FOR SELECT TO authenticated USING (true);
CREATE POLICY "kpi_periods write" ON public.kpi_periods FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 70)
  WITH CHECK (public.current_user_role_level() >= 70);

CREATE POLICY "kpi_scores scoped" ON public.kpi_scores FOR ALL TO authenticated
  USING (location_id IS NULL OR public.user_can_access_location(location_id))
  WITH CHECK (location_id IS NULL OR public.user_can_access_location(location_id));

CREATE POLICY "kpi_score_details via score" ON public.kpi_score_details FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.kpi_scores s
    WHERE s.id = score_id
      AND (s.location_id IS NULL OR public.user_can_access_location(s.location_id))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.kpi_scores s
    WHERE s.id = score_id
      AND (s.location_id IS NULL OR public.user_can_access_location(s.location_id))
  ));

CREATE TRIGGER trg_kpi_templates_updated BEFORE UPDATE ON public.kpi_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_kpi_scores_updated BEFORE UPDATE ON public.kpi_scores
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_kpi_score_details_updated BEFORE UPDATE ON public.kpi_score_details
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Rating helper
CREATE OR REPLACE FUNCTION public.kpi_rating_for_score(_score numeric)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _score >= 90 THEN 'excellent'
    WHEN _score >= 80 THEN 'good'
    WHEN _score >= 70 THEN 'needs_attention'
    ELSE 'poor'
  END;
$$;

-- Seed KPI templates
INSERT INTO public.kpi_templates (code, name, description, target_role) VALUES
  ('cashier_host', 'Cashier / Host KPI', 'Front-of-house performance scorecard', 'cashier_host'),
  ('operator', 'Operator KPI', 'Attraction operator performance', 'technician'),
  ('duty_manager', 'Supervisor / Duty Manager KPI', 'Shift supervision scorecard', 'duty_manager'),
  ('branch_manager', 'Branch Manager KPI', 'Branch leadership scorecard', 'branch_gm'),
  ('technician', 'Technician KPI', 'Maintenance technician scorecard', 'technician'),
  ('hr', 'HR KPI', 'HR operations scorecard', 'hr'),
  ('customer_service', 'Customer Service KPI', 'CX team scorecard', 'customer_service')
ON CONFLICT (code) DO NOTHING;

-- Seed template items (Cashier / Host)
INSERT INTO public.kpi_template_items (template_id, code, label, weight, data_source, auto_query_key, sort_order)
SELECT t.id, v.code, v.label, v.weight, v.data_source, v.auto_key, v.ord
FROM public.kpi_templates t
CROSS JOIN (VALUES
  ('attendance_punctuality', 'Attendance punctuality', 20, 'auto', 'attendance_punctuality', 1),
  ('cash_accuracy', 'Cash handling accuracy', 20, 'manual', NULL, 2),
  ('upsell_contribution', 'Upsell contribution', 15, 'manual', NULL, 3),
  ('complaint_count', 'Customer complaint count', 20, 'auto', 'complaint_count', 4),
  ('checklist_completion', 'Checklist completion', 25, 'auto', 'checklist_completion', 5)
) AS v(code, label, weight, data_source, auto_key, ord)
WHERE t.code = 'cashier_host'
ON CONFLICT (template_id, code) DO NOTHING;

-- Duty Manager items
INSERT INTO public.kpi_template_items (template_id, code, label, weight, data_source, auto_query_key, sort_order)
SELECT t.id, v.code, v.label, v.weight, v.data_source, v.auto_key, v.ord
FROM public.kpi_templates t
CROSS JOIN (VALUES
  ('opening_readiness', 'Opening readiness', 20, 'auto', 'opening_checklist', 1),
  ('closing_accuracy', 'Closing accuracy', 15, 'auto', 'closing_checklist', 2),
  ('staff_attendance', 'Staff attendance compliance', 20, 'auto', 'staff_attendance', 3),
  ('issue_closure', 'Issue closure follow-up', 15, 'auto', 'issue_closure', 4),
  ('revenue_target', 'Revenue target achievement', 20, 'auto', 'revenue_target', 5),
  ('handover_completion', 'Handover completion', 10, 'auto', 'handover_completion', 6)
) AS v(code, label, weight, data_source, auto_key, ord)
WHERE t.code = 'duty_manager'
ON CONFLICT (template_id, code) DO NOTHING;

-- Branch Manager items
INSERT INTO public.kpi_template_items (template_id, code, label, weight, data_source, auto_query_key, sort_order)
SELECT t.id, v.code, v.label, v.weight, v.data_source, v.auto_key, v.ord
FROM public.kpi_templates t
CROSS JOIN (VALUES
  ('revenue_achievement', 'Revenue achievement', 25, 'auto', 'revenue_target', 1),
  ('operational_health', 'Branch operational health', 20, 'auto', 'operational_health', 2),
  ('staff_performance', 'Staff performance', 15, 'manual', NULL, 3),
  ('customer_complaints', 'Customer complaints', 15, 'auto', 'complaint_count', 4),
  ('maintenance_downtime', 'Maintenance downtime', 15, 'auto', 'maintenance_downtime', 5),
  ('compliance_completion', 'Compliance completion', 10, 'auto', 'compliance_completion', 6)
) AS v(code, label, weight, data_source, auto_key, ord)
WHERE t.code = 'branch_manager'
ON CONFLICT (template_id, code) DO NOTHING;

-- Technician items
INSERT INTO public.kpi_template_items (template_id, code, label, weight, data_source, auto_query_key, sort_order)
SELECT t.id, v.code, v.label, v.weight, v.data_source, v.auto_key, v.ord
FROM public.kpi_templates t
CROSS JOIN (VALUES
  ('pm_completion', 'PM completion %', 25, 'auto', 'pm_completion', 1),
  ('mttr', 'Mean Time To Repair', 20, 'auto', 'mttr', 2),
  ('breakdown_response', 'Breakdown response time', 20, 'auto', 'breakdown_response', 3),
  ('repeat_issues', 'Repeat issue count', 15, 'auto', 'repeat_issues', 4),
  ('asset_uptime', 'Asset uptime', 20, 'auto', 'asset_uptime', 5)
) AS v(code, label, weight, data_source, auto_key, ord)
WHERE t.code = 'technician'
ON CONFLICT (template_id, code) DO NOTHING;

-- HR items
INSERT INTO public.kpi_template_items (template_id, code, label, weight, data_source, auto_query_key, sort_order)
SELECT t.id, v.code, v.label, v.weight, v.data_source, v.auto_key, v.ord
FROM public.kpi_templates t
CROSS JOIN (VALUES
  ('attendance_accuracy', 'Attendance report accuracy', 25, 'manual', NULL, 1),
  ('training_completion', 'Training completion', 25, 'auto', 'training_completion', 2),
  ('leave_processing', 'Leave processing', 25, 'manual', NULL, 3),
  ('document_compliance', 'Staff document compliance', 25, 'manual', NULL, 4)
) AS v(code, label, weight, data_source, auto_key, ord)
WHERE t.code = 'hr'
ON CONFLICT (template_id, code) DO NOTHING;

-- Customer Service items
INSERT INTO public.kpi_template_items (template_id, code, label, weight, data_source, auto_query_key, sort_order)
SELECT t.id, v.code, v.label, v.weight, v.data_source, v.auto_key, v.ord
FROM public.kpi_templates t
CROSS JOIN (VALUES
  ('response_time', 'Complaint response time', 25, 'auto', 'complaint_response_time', 1),
  ('closure_time', 'Complaint closure time', 25, 'auto', 'complaint_closure_time', 2),
  ('satisfaction', 'Customer satisfaction', 25, 'manual', NULL, 3),
  ('escalated_count', 'Escalated complaint count', 25, 'auto', 'escalated_complaints', 4)
) AS v(code, label, weight, data_source, auto_key, ord)
WHERE t.code = 'customer_service'
ON CONFLICT (template_id, code) DO NOTHING;

-- Current month period
INSERT INTO public.kpi_periods (period_kind, period_start, period_end, label, status)
VALUES (
  'month',
  date_trunc('month', CURRENT_DATE)::date,
  (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date,
  to_char(CURRENT_DATE, 'FMMonth YYYY'),
  'open'
)
ON CONFLICT (period_kind, period_start) DO NOTHING;
