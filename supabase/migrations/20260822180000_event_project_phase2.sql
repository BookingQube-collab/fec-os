-- ============================================================
-- Event Project Management — Phase 2
-- 20-stage lifecycle, project master fields, health override,
-- readiness categories, richer stage gates.
-- Does not rebuild Phase 1 — extends it.
-- ============================================================

-- ---------- Event master fields ----------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_name text,
  ADD COLUMN IF NOT EXISTS client_contact text,
  ADD COLUMN IF NOT EXISTS business_unit text,
  ADD COLUMN IF NOT EXISTS director_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.master_departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'Qatar',
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS planning_start date,
  ADD COLUMN IF NOT EXISTS venue_access date,
  ADD COLUMN IF NOT EXISTS rehearsal_date date,
  ADD COLUMN IF NOT EXISTS client_inspection_date date,
  ADD COLUMN IF NOT EXISTS dismantle_start date,
  ADD COLUMN IF NOT EXISTS dismantle_end date,
  ADD COLUMN IF NOT EXISTS handover_date date,
  ADD COLUMN IF NOT EXISTS financial_close_target date,
  ADD COLUMN IF NOT EXISTS final_closure_date date,
  ADD COLUMN IF NOT EXISTS prior_stage_id uuid REFERENCES public.evt_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS health_override_rag text
    CHECK (health_override_rag IS NULL OR health_override_rag IN ('green', 'amber', 'red', 'critical')),
  ADD COLUMN IF NOT EXISTS health_override_justification text,
  ADD COLUMN IF NOT EXISTS health_override_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS health_override_at timestamptz;

UPDATE public.events
SET event_name = COALESCE(event_name, name)
WHERE event_name IS NULL;

-- Health: add Critical
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_health_rag_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_health_rag_check
  CHECK (health_rag IN ('green', 'amber', 'red', 'critical'));

-- Copy legacy single dismantle date into the new pair when empty
UPDATE public.events
SET
  dismantle_start = COALESCE(dismantle_start, dismantle_date),
  dismantle_end = COALESCE(dismantle_end, dismantle_date)
WHERE dismantle_date IS NOT NULL
  AND (dismantle_start IS NULL OR dismantle_end IS NULL);

-- ---------- Stage / gate / readiness config ----------
ALTER TABLE public.evt_stages
  ADD COLUMN IF NOT EXISTS is_linear boolean NOT NULL DEFAULT true;

ALTER TABLE public.evt_stage_gate_requirements
  ADD COLUMN IF NOT EXISTS readiness_code text;

ALTER TABLE public.event_readiness_items
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'production';

ALTER TABLE public.evt_stage_gate_requirements
  DROP CONSTRAINT IF EXISTS evt_stage_gate_requirements_requirement_kind_check;

ALTER TABLE public.evt_stage_gate_requirements
  ADD CONSTRAINT evt_stage_gate_requirements_requirement_kind_check
  CHECK (requirement_kind IN (
    'scope_baseline', 'budget_approved', 'contract_value', 'deliverables',
    'milestones', 'readiness_min', 'no_open_critical_risks',
    'no_overdue_critical_tasks', 'manual',
    'venue_confirmed', 'readiness_item', 'has_pm', 'opening_date',
    'schedule_available', 'critical_prs_approved'
  ));

-- ---------- Remap the 8 Phase-1 stages onto the 20-stage path ----------
UPDATE public.evt_stages SET code = 'lead', label_en = 'Lead', label_ar = 'فرصة أولية', sort_order = 1, is_critical = false, is_terminal = false, is_linear = true WHERE code = 'inquiry';
UPDATE public.evt_stages SET code = 'proposal_prep', label_en = 'Proposal Preparation', label_ar = 'إعداد العرض', sort_order = 4, is_critical = false, is_terminal = false, is_linear = true WHERE code = 'proposal';
UPDATE public.evt_stages SET code = 'contracting', label_en = 'Contracting', label_ar = 'التعاقد', sort_order = 8, is_critical = false, is_terminal = false, is_linear = true WHERE code = 'contracted';
UPDATE public.evt_stages SET code = 'pre_production', label_en = 'Pre-Production', label_ar = 'ما قبل الإنتاج', sort_order = 11, is_critical = true, is_terminal = false, is_linear = true WHERE code = 'pre_production';
UPDATE public.evt_stages SET code = 'setup', label_en = 'Setup', label_ar = 'التركيب', sort_order = 12, is_critical = true, is_terminal = false, is_linear = true WHERE code = 'setup';
UPDATE public.evt_stages SET code = 'live_event', label_en = 'Live Event', label_ar = 'أيام الفعالية', sort_order = 14, is_critical = true, is_terminal = false, is_linear = true WHERE code = 'live';
UPDATE public.evt_stages SET code = 'dismantling', label_en = 'Dismantling', label_ar = 'الفك', sort_order = 15, is_critical = true, is_terminal = false, is_linear = true WHERE code = 'dismantle';
UPDATE public.evt_stages SET code = 'closed', label_en = 'Closed', label_ar = 'مغلق', sort_order = 18, is_critical = false, is_terminal = true, is_linear = true WHERE code = 'closed';

INSERT INTO public.evt_stages (code, label_en, label_ar, sort_order, is_critical, is_terminal, is_linear) VALUES
  ('opportunity', 'Opportunity', 'فرصة', 2, false, false, true),
  ('feasibility', 'Feasibility', 'دراسة الجدوى', 3, false, false, true),
  ('proposal_submitted', 'Proposal Submitted', 'تم تقديم العرض', 5, false, false, true),
  ('negotiation', 'Negotiation', 'تفاوض', 6, false, false, true),
  ('awarded', 'Awarded', 'تم الترسية', 7, false, false, true),
  ('planning', 'Planning', 'التخطيط', 9, true, false, true),
  ('procurement', 'Procurement', 'المشتريات', 10, true, false, true),
  ('ready_for_opening', 'Ready for Opening', 'جاهز للافتتاح', 13, true, false, true),
  ('financial_closure', 'Financial Closure', 'الإغلاق المالي', 16, false, false, true),
  ('post_evaluation', 'Post Event Evaluation', 'تقييم ما بعد الفعالية', 17, false, false, true),
  ('cancelled', 'Cancelled', 'ملغى', 19, false, true, false),
  ('on_hold', 'On Hold', 'معلّق', 20, false, false, false)
ON CONFLICT (code) DO UPDATE SET
  label_en = EXCLUDED.label_en,
  label_ar = EXCLUDED.label_ar,
  sort_order = EXCLUDED.sort_order,
  is_critical = EXCLUDED.is_critical,
  is_terminal = EXCLUDED.is_terminal,
  is_linear = EXCLUDED.is_linear,
  active = true;

-- ---------- Classifications from the master spec ----------
UPDATE public.evt_classifications
SET label_en = 'External Client', label_ar = 'عميل خارجي'
WHERE code = 'client';

INSERT INTO public.evt_classifications (code, label_en, label_ar, sort_order) VALUES
  ('mall_activation', 'Mall Activation', 'تفعيل مول', 5),
  ('fec_event', 'FEC Event', 'فعالية مركز ترفيه', 6),
  ('corporate_event', 'Corporate Event', 'فعالية شركات', 7),
  ('seasonal_event', 'Seasonal Event', 'فعالية موسمية', 8),
  ('exhibition', 'Exhibition', 'معرض', 9),
  ('promotion', 'Promotion', 'ترويج', 10),
  ('roadshow', 'Roadshow', 'جولة ترويجية', 11),
  ('temporary_attraction', 'Temporary Attraction', 'جاذبية مؤقتة', 12),
  ('other', 'Other', 'أخرى', 13)
ON CONFLICT (code) DO NOTHING;

-- ---------- Stage gates: Planning → Pre-Production and later critical hops ----------
DELETE FROM public.event_gate_completions;
DELETE FROM public.evt_stage_gate_requirements;

INSERT INTO public.evt_stage_gate_requirements (
  stage_id, code, label_en, label_ar, requirement_kind, readiness_code, is_blocking, threshold, sort_order
)
SELECT s.id, v.code, v.label_en, v.label_ar, v.kind, v.readiness_code, true, v.threshold, v.sort_order
FROM public.evt_stages s
JOIN (VALUES
  -- Enter contracting
  ('contracting', 'contract_value', 'Contract value entered', 'قيمة العقد مدخلة', 'contract_value', NULL, NULL::numeric, 1),
  -- Enter planning
  ('planning', 'contract_value', 'Contract value entered', 'قيمة العقد مدخلة', 'contract_value', NULL, NULL, 1),
  ('planning', 'has_pm', 'Project manager assigned', 'مدير المشروع معيّن', 'has_pm', NULL, NULL, 2),
  -- Enter procurement
  ('procurement', 'scope_baseline', 'Client-approved scope baseline', 'خط أساس النطاق المعتمد من العميل', 'scope_baseline', NULL, NULL, 1),
  -- Enter pre-production (Planning → Pre-Production gate list)
  ('pre_production', 'scope_baseline', 'Client-approved scope', 'نطاق معتمد من العميل', 'scope_baseline', NULL, NULL, 1),
  ('pre_production', 'budget_approved', 'Approved project budget', 'ميزانية المشروع معتمدة', 'budget_approved', NULL, NULL, 2),
  ('pre_production', 'venue_confirmed', 'Venue confirmed', 'المكان مؤكد', 'venue_confirmed', NULL, NULL, 3),
  ('pre_production', 'permits_identified', 'Required permits identified', 'التصاريح المطلوبة محددة', 'readiness_item', 'permits_identified', NULL, 4),
  ('pre_production', 'critical_suppliers', 'Critical suppliers appointed', 'الموردون الحرجون معيّنون', 'readiness_item', 'critical_suppliers', NULL, 5),
  ('pre_production', 'manpower_plan', 'Manpower requirement completed', 'خطة القوى العاملة مكتملة', 'readiness_item', 'manpower_plan', NULL, 6),
  ('pre_production', 'risk_assessment', 'Risk assessment completed', 'تقييم المخاطر مكتمل', 'readiness_item', 'risk_assessment', NULL, 7),
  ('pre_production', 'production_schedule', 'Production schedule available', 'جدول الإنتاج متوفر', 'schedule_available', 'production_schedule', NULL, 8),
  ('pre_production', 'critical_prs', 'Procurement critical items approved', 'بنود المشتريات الحرجة معتمدة', 'critical_prs_approved', 'critical_prs', NULL, 9),
  -- Enter setup
  ('setup', 'no_overdue_critical', 'No overdue critical tasks', 'لا مهام حرجة متأخرة', 'no_overdue_critical_tasks', NULL, NULL, 1),
  ('setup', 'readiness_min', 'Readiness at least 70%', 'الجاهزية 70٪ على الأقل', 'readiness_min', NULL, 70, 2),
  -- Enter ready for opening
  ('ready_for_opening', 'no_overdue_critical', 'No overdue critical tasks', 'لا مهام حرجة متأخرة', 'no_overdue_critical_tasks', NULL, NULL, 1),
  -- Enter live
  ('live_event', 'no_overdue_critical', 'No overdue critical tasks', 'لا مهام حرجة متأخرة', 'no_overdue_critical_tasks', NULL, NULL, 1),
  ('live_event', 'opening_date', 'Event opening date set', 'تاريخ افتتاح الفعالية محدد', 'opening_date', NULL, NULL, 2),
  -- Enter closed
  ('closed', 'no_open_critical_risks', 'No open critical risks', 'لا مخاطر حرجة مفتوحة', 'no_open_critical_risks', NULL, NULL, 1)
) AS v(stage_code, code, label_en, label_ar, kind, readiness_code, threshold, sort_order)
  ON s.code = v.stage_code;

CREATE INDEX IF NOT EXISTS idx_events_director ON public.events (director_staff_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_department ON public.events (department_id) WHERE deleted_at IS NULL;
