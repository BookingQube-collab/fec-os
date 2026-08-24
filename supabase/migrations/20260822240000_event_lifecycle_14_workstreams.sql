-- ============================================================
-- Event PM: 14-phase lifecycle + 13 coordinating workstreams
-- Remaps existing 20-stage model. Does not rebuild budget.
-- ============================================================

-- ---------- Columns ----------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS lessons_learned text;

ALTER TABLE public.event_tasks
  ADD COLUMN IF NOT EXISTS lifecycle_phase text;

ALTER TABLE public.event_readiness_items
  ADD COLUMN IF NOT EXISTS phase_code text;

CREATE INDEX IF NOT EXISTS idx_event_tasks_lifecycle
  ON public.event_tasks (event_id, lifecycle_phase)
  WHERE deleted_at IS NULL;

-- ---------- Remap existing stage rows onto the 14-phase list ----------
UPDATE public.evt_stages SET
  code = 'initiation', label_en = 'Event initiation', label_ar = 'بدء الفعالية',
  sort_order = 1, is_critical = false, is_terminal = false, is_linear = true, active = true
WHERE code IN ('lead', 'inquiry')
  AND NOT EXISTS (SELECT 1 FROM public.evt_stages s WHERE s.code = 'initiation');

UPDATE public.evt_stages SET
  code = 'feasibility', label_en = 'Feasibility', label_ar = 'الجدوى',
  sort_order = 2, is_critical = false, is_terminal = false, is_linear = true, active = true
WHERE code = 'feasibility';

UPDATE public.evt_stages SET
  code = 'budget_approval', label_en = 'Budget approval', label_ar = 'اعتماد الميزانية',
  sort_order = 3, is_critical = true, is_terminal = false, is_linear = true, active = true
WHERE code IN ('proposal_prep', 'proposal')
  AND NOT EXISTS (SELECT 1 FROM public.evt_stages s WHERE s.code = 'budget_approval');

UPDATE public.evt_stages SET
  code = 'design', label_en = 'Design', label_ar = 'التصميم',
  sort_order = 4, is_critical = false, is_terminal = false, is_linear = true, active = true
WHERE code = 'planning'
  AND NOT EXISTS (SELECT 1 FROM public.evt_stages s WHERE s.code = 'design');

UPDATE public.evt_stages SET
  label_en = 'Procurement', label_ar = 'المشتريات',
  sort_order = 5, is_critical = true, is_terminal = false, is_linear = true, active = true
WHERE code = 'procurement';

UPDATE public.evt_stages SET
  label_en = 'Pre-production', label_ar = 'ما قبل الإنتاج',
  sort_order = 6, is_critical = true, is_terminal = false, is_linear = true, active = true
WHERE code = 'pre_production';

UPDATE public.evt_stages SET
  code = 'bump_in', label_en = 'Bump-in', label_ar = 'الدخول والتركيب',
  sort_order = 9, is_critical = true, is_terminal = false, is_linear = true, active = true
WHERE code = 'setup'
  AND NOT EXISTS (SELECT 1 FROM public.evt_stages s WHERE s.code = 'bump_in');

UPDATE public.evt_stages SET
  code = 'go_live', label_en = 'Go-live', label_ar = 'الانطلاق',
  sort_order = 11, is_critical = true, is_terminal = false, is_linear = true, active = true
WHERE code = 'ready_for_opening'
  AND NOT EXISTS (SELECT 1 FROM public.evt_stages s WHERE s.code = 'go_live');

UPDATE public.evt_stages SET
  code = 'operations', label_en = 'Operations', label_ar = 'التشغيل',
  sort_order = 12, is_critical = true, is_terminal = false, is_linear = true, active = true
WHERE code IN ('live_event', 'live')
  AND NOT EXISTS (SELECT 1 FROM public.evt_stages s WHERE s.code = 'operations');

UPDATE public.evt_stages SET
  code = 'bump_out', label_en = 'Bump-out', label_ar = 'الخروج والفك',
  sort_order = 13, is_critical = true, is_terminal = false, is_linear = true, active = true
WHERE code IN ('dismantling', 'dismantle')
  AND NOT EXISTS (SELECT 1 FROM public.evt_stages s WHERE s.code = 'bump_out');

UPDATE public.evt_stages SET
  code = 'closure', label_en = 'Closure', label_ar = 'الإغلاق',
  sort_order = 14, is_critical = false, is_terminal = true, is_linear = true, active = true
WHERE code = 'closed'
  AND NOT EXISTS (SELECT 1 FROM public.evt_stages s WHERE s.code = 'closure');

INSERT INTO public.evt_stages (code, label_en, label_ar, sort_order, is_critical, is_terminal, is_linear, active) VALUES
  ('initiation', 'Event initiation', 'بدء الفعالية', 1, false, false, true, true),
  ('feasibility', 'Feasibility', 'الجدوى', 2, false, false, true, true),
  ('budget_approval', 'Budget approval', 'اعتماد الميزانية', 3, true, false, true, true),
  ('design', 'Design', 'التصميم', 4, false, false, true, true),
  ('procurement', 'Procurement', 'المشتريات', 5, true, false, true, true),
  ('pre_production', 'Pre-production', 'ما قبل الإنتاج', 6, true, false, true, true),
  ('staffing', 'Staffing', 'التوظيف', 7, false, false, true, true),
  ('logistics', 'Logistics', 'اللوجستيات', 8, false, false, true, true),
  ('bump_in', 'Bump-in', 'الدخول والتركيب', 9, true, false, true, true),
  ('testing', 'Testing', 'الاختبار', 10, true, false, true, true),
  ('go_live', 'Go-live', 'الانطلاق', 11, true, false, true, true),
  ('operations', 'Operations', 'التشغيل', 12, true, false, true, true),
  ('bump_out', 'Bump-out', 'الخروج والفك', 13, true, false, true, true),
  ('closure', 'Closure', 'الإغلاق', 14, false, true, true, true),
  ('cancelled', 'Cancelled', 'ملغى', 90, false, true, false, true),
  ('on_hold', 'On Hold', 'معلّق', 91, false, false, false, true)
ON CONFLICT (code) DO UPDATE SET
  label_en = EXCLUDED.label_en,
  label_ar = EXCLUDED.label_ar,
  sort_order = EXCLUDED.sort_order,
  is_critical = EXCLUDED.is_critical,
  is_terminal = EXCLUDED.is_terminal,
  is_linear = EXCLUDED.is_linear,
  active = true;

-- Point events still on leftover commercial / closeout stages at the canonical 14
UPDATE public.events e
SET stage_id = t.id
FROM public.evt_stages old
JOIN public.evt_stages t ON t.code = CASE old.code
  WHEN 'opportunity' THEN 'initiation'
  WHEN 'proposal_submitted' THEN 'budget_approval'
  WHEN 'negotiation' THEN 'budget_approval'
  WHEN 'awarded' THEN 'budget_approval'
  WHEN 'contracting' THEN 'budget_approval'
  WHEN 'contracted' THEN 'budget_approval'
  WHEN 'financial_closure' THEN 'closure'
  WHEN 'post_evaluation' THEN 'closure'
  WHEN 'post_event' THEN 'closure'
  WHEN 'lead' THEN 'initiation'
  WHEN 'inquiry' THEN 'initiation'
  WHEN 'proposal_prep' THEN 'budget_approval'
  WHEN 'proposal' THEN 'budget_approval'
  WHEN 'planning' THEN 'design'
  WHEN 'setup' THEN 'bump_in'
  WHEN 'ready_for_opening' THEN 'go_live'
  WHEN 'live_event' THEN 'operations'
  WHEN 'live' THEN 'operations'
  WHEN 'dismantling' THEN 'bump_out'
  WHEN 'dismantle' THEN 'bump_out'
  WHEN 'closed' THEN 'closure'
  ELSE NULL
END
WHERE e.stage_id = old.id
  AND t.id IS NOT NULL
  AND old.code <> t.code;

UPDATE public.events e
SET prior_stage_id = t.id
FROM public.evt_stages old
JOIN public.evt_stages t ON t.code = CASE old.code
  WHEN 'opportunity' THEN 'initiation'
  WHEN 'proposal_submitted' THEN 'budget_approval'
  WHEN 'negotiation' THEN 'budget_approval'
  WHEN 'awarded' THEN 'budget_approval'
  WHEN 'contracting' THEN 'budget_approval'
  WHEN 'financial_closure' THEN 'closure'
  WHEN 'post_evaluation' THEN 'closure'
  WHEN 'lead' THEN 'initiation'
  WHEN 'planning' THEN 'design'
  WHEN 'setup' THEN 'bump_in'
  WHEN 'ready_for_opening' THEN 'go_live'
  WHEN 'live_event' THEN 'operations'
  WHEN 'dismantling' THEN 'bump_out'
  WHEN 'closed' THEN 'closure'
  ELSE NULL
END
WHERE e.prior_stage_id = old.id
  AND t.id IS NOT NULL
  AND old.code <> t.code;

-- Deactivate leftover 20-stage rows (do not delete — FKs / audit)
UPDATE public.evt_stages
SET active = false, is_linear = false
WHERE code NOT IN (
  'initiation', 'feasibility', 'budget_approval', 'design', 'procurement',
  'pre_production', 'staffing', 'logistics', 'bump_in', 'testing',
  'go_live', 'operations', 'bump_out', 'closure', 'cancelled', 'on_hold'
);

UPDATE public.evt_stage_gate_requirements g
SET active = false
FROM public.evt_stages s
WHERE g.stage_id = s.id AND s.active = false;

-- Move go-live approval gate onto Go-live (phase 11)
UPDATE public.evt_stage_gate_requirements g
SET stage_id = s.id
FROM public.evt_stages s
WHERE g.code = 'go_live_approval'
  AND s.code = 'go_live';

-- New / remapped gates (additive)
INSERT INTO public.evt_stage_gate_requirements (
  stage_id, code, label_en, label_ar, requirement_kind, readiness_code, is_blocking, threshold, sort_order
)
SELECT s.id, v.code, v.label_en, v.label_ar, v.kind, v.readiness_code, true, NULL, v.sort_order
FROM public.evt_stages s
JOIN (VALUES
  ('feasibility', 'client_brief', 'Client brief signed', 'موجز العميل موقع', 'readiness_item', 'client_brief', 1),
  ('feasibility', 'location_dates', 'Location and dates locked', 'المكان والتواريخ مثبتة', 'readiness_item', 'location_dates', 2),
  ('budget_approval', 'site_survey', 'Site survey complete', 'مسح الموقع مكتمل', 'readiness_item', 'site_survey', 1),
  ('budget_approval', 'risk_assessment', 'Risk assessment completed', 'تقييم المخاطر مكتمل', 'readiness_item', 'risk_assessment', 2),
  ('design', 'budget_approved', 'Approved project budget', 'ميزانية المشروع معتمدة', 'budget_approved', NULL, 1),
  ('procurement', 'floor_plan', 'Layout / floor plan approved', 'المخطط معتمد', 'readiness_item', 'floor_plan', 1),
  ('staffing', 'production_schedule', 'Production schedule available', 'جدول الإنتاج متوفر', 'readiness_item', 'production_schedule', 1),
  ('logistics', 'manpower_plan', 'Manpower requirement completed', 'خطة القوى العاملة مكتملة', 'readiness_item', 'manpower_plan', 1),
  ('bump_in', 'logistics_plan', 'Vehicle / logistics plan drafted', 'خطة اللوجستيات جاهزة', 'readiness_item', 'logistics_plan', 1),
  ('bump_in', 'delivery_slots', 'Delivery slots booked', 'فترات التسليم محجوزة', 'readiness_item', 'delivery_slots', 2),
  ('testing', 'installation', 'Installation complete', 'التركيب مكتمل', 'readiness_item', 'installation', 1),
  ('go_live', 'safety_checks', 'Safety checks complete', 'فحوصات السلامة مكتملة', 'readiness_item', 'safety_checks', 1),
  ('go_live', 'go_live_approval', 'Opening / go-live approval', 'اعتماد الانطلاق', 'readiness_item', 'go_live_approval', 2),
  ('operations', 'go_live_approval', 'Opening / go-live approval', 'اعتماد الانطلاق', 'readiness_item', 'go_live_approval', 1),
  ('bump_out', 'daily_reporting', 'Daily reporting cadence set', 'التقرير اليومي محدد', 'readiness_item', 'daily_reporting', 1),
  ('closure', 'asset_reconciliation', 'Asset reconciliation complete', 'مطابقة الأصول مكتملة', 'readiness_item', 'asset_reconciliation', 1)
) AS v(stage_code, code, label_en, label_ar, kind, readiness_code, sort_order)
ON s.code = v.stage_code
ON CONFLICT (stage_id, code) DO UPDATE SET
  label_en = EXCLUDED.label_en,
  label_ar = EXCLUDED.label_ar,
  requirement_kind = EXCLUDED.requirement_kind,
  readiness_code = EXCLUDED.readiness_code,
  is_blocking = true,
  active = true;

-- Existing pre_production gates stay (scope, budget, venue, permits, …)

-- ---------- Rename / merge WBS workstreams to the 13 functions ----------
UPDATE public.event_wbs_nodes src
SET code = 'project_management', title = 'Project management', sort_order = 2
WHERE src.code = 'project_approvals' AND src.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.event_wbs_nodes t
    WHERE t.event_id = src.event_id AND t.code = 'project_management' AND t.deleted_at IS NULL
  );

UPDATE public.event_wbs_nodes src
SET code = 'mall_venue', title = 'Mall or venue management', sort_order = 10
WHERE src.code = 'venue_permits' AND src.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.event_wbs_nodes t
    WHERE t.event_id = src.event_id AND t.code = 'mall_venue' AND t.deleted_at IS NULL
  );

UPDATE public.event_wbs_nodes src
SET code = 'creative_branding', title = 'Creative and branding', sort_order = 3
WHERE src.code = 'design_branding' AND src.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.event_wbs_nodes t
    WHERE t.event_id = src.event_id AND t.code = 'creative_branding' AND t.deleted_at IS NULL
  );

UPDATE public.event_wbs_nodes src
SET code = 'production_technical', title = 'Production and technical', sort_order = 4
WHERE src.code = 'production_fabrication' AND src.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.event_wbs_nodes t
    WHERE t.event_id = src.event_id AND t.code = 'production_technical' AND t.deleted_at IS NULL
  );

UPDATE public.event_wbs_nodes
SET title = 'IT and POS', sort_order = 5
WHERE code = 'it_pos' AND deleted_at IS NULL;

UPDATE public.event_wbs_nodes
SET title = 'Procurement and finance', sort_order = 6
WHERE code = 'procurement_finance' AND deleted_at IS NULL;

UPDATE public.event_wbs_nodes src
SET code = 'logistics_warehouse', title = 'Logistics and warehouse', sort_order = 7
WHERE src.code = 'logistics_assets' AND src.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.event_wbs_nodes t
    WHERE t.event_id = src.event_id AND t.code = 'logistics_warehouse' AND t.deleted_at IS NULL
  );

UPDATE public.event_wbs_nodes src
SET code = 'hr_staffing', title = 'HR and staffing', sort_order = 8
WHERE src.code = 'staffing_training' AND src.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.event_wbs_nodes t
    WHERE t.event_id = src.event_id AND t.code = 'hr_staffing' AND t.deleted_at IS NULL
  );

UPDATE public.event_wbs_nodes src
SET code = 'marketing', title = 'Marketing', sort_order = 9
WHERE src.code = 'marketing_comms' AND src.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.event_wbs_nodes t
    WHERE t.event_id = src.event_id AND t.code = 'marketing' AND t.deleted_at IS NULL
  );

UPDATE public.event_wbs_nodes src
SET code = 'health_safety', title = 'Health and safety', sort_order = 12
WHERE src.code = 'safety_quality' AND src.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.event_wbs_nodes t
    WHERE t.event_id = src.event_id AND t.code = 'health_safety' AND t.deleted_at IS NULL
  );

UPDATE public.event_wbs_nodes src
SET code = 'operations', title = 'Operations', sort_order = 1
WHERE src.code = 'live_ops' AND src.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.event_wbs_nodes t
    WHERE t.event_id = src.event_id AND t.code = 'operations' AND t.deleted_at IS NULL
  );

-- Merge leftover codes into the canonical 13
DO $$
DECLARE
  pair record;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('games_equipment', 'production_technical'),
      ('critical_controls', 'health_safety'),
      ('bump_in', 'operations'),
      ('bump_out', 'operations'),
      ('project_approvals', 'project_management'),
      ('venue_permits', 'mall_venue'),
      ('design_branding', 'creative_branding'),
      ('production_fabrication', 'production_technical'),
      ('logistics_assets', 'logistics_warehouse'),
      ('staffing_training', 'hr_staffing'),
      ('marketing_comms', 'marketing'),
      ('safety_quality', 'health_safety'),
      ('live_ops', 'operations')
    ) AS x(src_code, tgt_code)
  LOOP
    UPDATE public.event_tasks t
    SET wbs_id = tgt.id
    FROM public.event_wbs_nodes src
    JOIN public.event_wbs_nodes tgt
      ON tgt.event_id = src.event_id AND tgt.code = pair.tgt_code AND tgt.deleted_at IS NULL
    WHERE src.code = pair.src_code AND src.deleted_at IS NULL
      AND t.wbs_id = src.id;

    UPDATE public.event_wbs_nodes child
    SET parent_id = tgt.id
    FROM public.event_wbs_nodes src
    JOIN public.event_wbs_nodes tgt
      ON tgt.event_id = src.event_id AND tgt.code = pair.tgt_code AND tgt.deleted_at IS NULL
    WHERE src.code = pair.src_code AND src.deleted_at IS NULL
      AND child.parent_id = src.id
      AND child.id <> tgt.id;

    UPDATE public.event_milestones m
    SET wbs_id = tgt.id
    FROM public.event_wbs_nodes src
    JOIN public.event_wbs_nodes tgt
      ON tgt.event_id = src.event_id AND tgt.code = pair.tgt_code AND tgt.deleted_at IS NULL
    WHERE src.code = pair.src_code AND src.deleted_at IS NULL
      AND m.wbs_id = src.id;

    UPDATE public.event_issues i
    SET wbs_id = tgt.id
    FROM public.event_wbs_nodes src
    JOIN public.event_wbs_nodes tgt
      ON tgt.event_id = src.event_id AND tgt.code = pair.tgt_code AND tgt.deleted_at IS NULL
    WHERE src.code = pair.src_code AND src.deleted_at IS NULL
      AND i.wbs_id = src.id;

    UPDATE public.event_wbs_nodes src
    SET deleted_at = now()
    FROM public.event_wbs_nodes tgt
    WHERE src.code = pair.src_code AND src.deleted_at IS NULL
      AND tgt.event_id = src.event_id AND tgt.code = pair.tgt_code AND tgt.deleted_at IS NULL
      AND src.id <> tgt.id;
  END LOOP;
END $$;

-- Seed any missing coordinating functions on existing events
INSERT INTO public.event_wbs_nodes (event_id, parent_id, node_type, code, title, sort_order)
SELECT e.id, NULL, 'phase', v.code, v.title_en, v.sort_order
FROM public.events e
CROSS JOIN (VALUES
  ('operations', 'Operations', 1),
  ('project_management', 'Project management', 2),
  ('creative_branding', 'Creative and branding', 3),
  ('production_technical', 'Production and technical', 4),
  ('it_pos', 'IT and POS', 5),
  ('procurement_finance', 'Procurement and finance', 6),
  ('logistics_warehouse', 'Logistics and warehouse', 7),
  ('hr_staffing', 'HR and staffing', 8),
  ('marketing', 'Marketing', 9),
  ('mall_venue', 'Mall or venue management', 10),
  ('vendors_contractors', 'Vendors and contractors', 11),
  ('health_safety', 'Health and safety', 12),
  ('maintenance', 'Maintenance', 13)
) AS v(code, title_en, sort_order)
WHERE e.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.event_wbs_nodes n
    WHERE n.event_id = e.id AND n.deleted_at IS NULL AND n.code = v.code
  );

UPDATE public.event_wbs_nodes n
SET title = v.title_en, sort_order = v.sort_order
FROM (VALUES
  ('operations', 'Operations', 1),
  ('project_management', 'Project management', 2),
  ('creative_branding', 'Creative and branding', 3),
  ('production_technical', 'Production and technical', 4),
  ('it_pos', 'IT and POS', 5),
  ('procurement_finance', 'Procurement and finance', 6),
  ('logistics_warehouse', 'Logistics and warehouse', 7),
  ('hr_staffing', 'HR and staffing', 8),
  ('marketing', 'Marketing', 9),
  ('mall_venue', 'Mall or venue management', 10),
  ('vendors_contractors', 'Vendors and contractors', 11),
  ('health_safety', 'Health and safety', 12),
  ('maintenance', 'Maintenance', 13)
) AS v(code, title_en, sort_order)
WHERE n.code = v.code AND n.deleted_at IS NULL;

-- Backfill task lifecycle_phase from WBS code (do not overwrite a set value)
UPDATE public.event_tasks t
SET lifecycle_phase = CASE n.code
  WHEN 'project_management' THEN 'initiation'
  WHEN 'project_approvals' THEN 'initiation'
  WHEN 'mall_venue' THEN 'feasibility'
  WHEN 'venue_permits' THEN 'feasibility'
  WHEN 'creative_branding' THEN 'design'
  WHEN 'design_branding' THEN 'design'
  WHEN 'procurement_finance' THEN 'procurement'
  WHEN 'vendors_contractors' THEN 'procurement'
  WHEN 'production_technical' THEN 'pre_production'
  WHEN 'it_pos' THEN 'bump_in'
  WHEN 'logistics_warehouse' THEN 'logistics'
  WHEN 'hr_staffing' THEN 'staffing'
  WHEN 'marketing' THEN 'design'
  WHEN 'health_safety' THEN 'testing'
  WHEN 'operations' THEN 'operations'
  WHEN 'maintenance' THEN 'operations'
  WHEN 'bump_in' THEN 'bump_in'
  WHEN 'bump_out' THEN 'bump_out'
  ELSE t.lifecycle_phase
END
FROM public.event_wbs_nodes n
WHERE t.wbs_id = n.id
  AND t.lifecycle_phase IS NULL
  AND t.deleted_at IS NULL;

-- Phase codes on existing readiness rows
UPDATE public.event_readiness_items SET phase_code = 'initiation' WHERE code IN ('client_brief', 'objectives', 'location_dates', 'capacity', 'scope_approved', 'stakeholders') AND phase_code IS NULL;
UPDATE public.event_readiness_items SET phase_code = 'feasibility' WHERE code IN ('site_survey', 'measurements', 'utilities', 'site_access', 'permits_identified', 'risk_assessment', 'venue_confirmed', 'permits', 'insurance') AND phase_code IS NULL;
UPDATE public.event_readiness_items SET phase_code = 'budget_approval' WHERE code IN ('budget_ack', 'quotation_compare', 'payment_schedule') AND phase_code IS NULL;
UPDATE public.event_readiness_items SET phase_code = 'design' WHERE code IN ('floor_plan', 'renders', 'branding_pack', 'power_plan', 'equipment_list', 'customer_flow') AND phase_code IS NULL;
UPDATE public.event_readiness_items SET phase_code = 'procurement' WHERE code IN ('critical_prs', 'pos_issued', 'critical_suppliers', 'delivery_dates', 'payment_status') AND phase_code IS NULL;
UPDATE public.event_readiness_items SET phase_code = 'pre_production' WHERE code IN ('production_schedule', 'fabrication', 'printing', 'equipment_prep', 'preprod_testing', 'packing', 'kit_list') AND phase_code IS NULL;
UPDATE public.event_readiness_items SET phase_code = 'staffing' WHERE code IN ('manpower_plan', 'roster', 'uniforms', 'training', 'access_passes') AND phase_code IS NULL;
UPDATE public.event_readiness_items SET phase_code = 'logistics' WHERE code IN ('logistics_plan', 'loading_list', 'delivery_slots', 'mall_access', 'asset_movement_plan') AND phase_code IS NULL;
UPDATE public.event_readiness_items SET phase_code = 'bump_in' WHERE code IN ('installation', 'technical_setup', 'pos_setup', 'network_setup', 'branding_install', 'inspections') AND phase_code IS NULL;
UPDATE public.event_readiness_items SET phase_code = 'testing' WHERE code IN ('equipment_testing', 'safety_checks', 'snagging', 'operational_rehearsal', 'run_of_show', 'safety') AND phase_code IS NULL;
UPDATE public.event_readiness_items SET phase_code = 'go_live' WHERE code IN ('go_live_approval', 'command_structure', 'incident_reporting', 'daily_reporting', 'comms') AND phase_code IS NULL;
UPDATE public.event_readiness_items SET phase_code = 'operations' WHERE code IN ('sales_ops', 'attendance_ops', 'staffing_ops', 'maintenance_ops', 'stock_ops', 'incidents_ops', 'feedback_ops') AND phase_code IS NULL;
UPDATE public.event_readiness_items SET phase_code = 'bump_out' WHERE code IN ('dismantling', 'asset_reconciliation', 'return_transport', 'damage_reporting') AND phase_code IS NULL;
UPDATE public.event_readiness_items SET phase_code = 'closure' WHERE code IN ('supplier_settlement', 'final_cost', 'profitability_review', 'lessons_learned', 'closure_signoff') AND phase_code IS NULL;

-- Add missing readiness checklist rows for every live event
INSERT INTO public.event_readiness_items (event_id, code, title, category, is_required, is_complete, weight, phase_code)
SELECT e.id, v.code, v.title, v.category, true, false, v.weight, v.phase_code
FROM public.events e
CROSS JOIN (VALUES
  ('objectives', 'Event objectives agreed', 'scope', 8, 'initiation'),
  ('location_dates', 'Location and dates locked', 'venue', 8, 'initiation'),
  ('capacity', 'Capacity and audience size set', 'scope', 6, 'initiation'),
  ('stakeholders', 'Stakeholders mapped', 'approvals', 6, 'initiation'),
  ('measurements', 'Site measurements recorded', 'venue', 6, 'feasibility'),
  ('utilities', 'Utilities survey complete', 'venue', 6, 'feasibility'),
  ('site_access', 'Access route confirmed', 'venue', 6, 'feasibility'),
  ('quotation_compare', 'Quotation comparison complete', 'budget', 8, 'budget_approval'),
  ('payment_schedule', 'Payment schedule agreed', 'budget', 6, 'budget_approval'),
  ('renders', 'Renders issued', 'production', 6, 'design'),
  ('branding_pack', 'Branding pack approved', 'production', 6, 'design'),
  ('equipment_list', 'Equipment list locked', 'inventory', 6, 'design'),
  ('customer_flow', 'Customer flow approved', 'venue', 6, 'design'),
  ('pos_issued', 'Purchase orders issued', 'procurement', 8, 'procurement'),
  ('delivery_dates', 'Delivery dates confirmed', 'procurement', 8, 'procurement'),
  ('payment_status', 'Supplier payment status reviewed', 'budget', 6, 'procurement'),
  ('fabrication', 'Fabrication in progress or complete', 'production', 8, 'pre_production'),
  ('printing', 'Printing complete', 'production', 6, 'pre_production'),
  ('equipment_prep', 'Equipment prepared', 'inventory', 8, 'pre_production'),
  ('preprod_testing', 'Pre-production testing done', 'production', 6, 'pre_production'),
  ('packing', 'Packing list complete', 'logistics', 6, 'pre_production'),
  ('roster', 'Roster published', 'manpower', 8, 'staffing'),
  ('uniforms', 'Uniforms confirmed', 'manpower', 6, 'staffing'),
  ('training', 'Staff training complete', 'manpower', 8, 'staffing'),
  ('access_passes', 'Access passes issued', 'manpower', 6, 'staffing'),
  ('loading_list', 'Loading list complete', 'logistics', 6, 'logistics'),
  ('delivery_slots', 'Delivery slots booked', 'logistics', 8, 'logistics'),
  ('mall_access', 'Mall / venue access booked', 'venue', 8, 'logistics'),
  ('asset_movement_plan', 'Asset movement plan issued', 'inventory', 6, 'logistics'),
  ('installation', 'Installation complete', 'production', 8, 'bump_in'),
  ('technical_setup', 'Technical setup complete', 'production', 8, 'bump_in'),
  ('pos_setup', 'POS live on site', 'production', 8, 'bump_in'),
  ('network_setup', 'Network live on site', 'production', 6, 'bump_in'),
  ('branding_install', 'Branding installed', 'production', 6, 'bump_in'),
  ('inspections', 'Site inspections passed', 'safety', 8, 'bump_in'),
  ('equipment_testing', 'Equipment testing complete', 'production', 8, 'testing'),
  ('safety_checks', 'Safety checks complete', 'safety', 10, 'testing'),
  ('snagging', 'Snagging closed or accepted', 'safety', 8, 'testing'),
  ('operational_rehearsal', 'Operational rehearsal complete', 'production', 8, 'testing'),
  ('command_structure', 'Command structure posted', 'approvals', 8, 'go_live'),
  ('incident_reporting', 'Incident reporting live', 'safety', 6, 'go_live'),
  ('daily_reporting', 'Daily reporting cadence set', 'approvals', 6, 'go_live'),
  ('sales_ops', 'Sales process live', 'production', 6, 'operations'),
  ('attendance_ops', 'Attendance tracking live', 'manpower', 6, 'operations'),
  ('staffing_ops', 'Live staffing covered', 'manpower', 6, 'operations'),
  ('maintenance_ops', 'Maintenance cover in place', 'production', 6, 'operations'),
  ('stock_ops', 'Stock / consumables tracked', 'inventory', 6, 'operations'),
  ('incidents_ops', 'Incidents logged daily', 'safety', 6, 'operations'),
  ('feedback_ops', 'Guest feedback captured', 'approvals', 4, 'operations'),
  ('dismantling', 'Dismantling complete', 'production', 8, 'bump_out'),
  ('asset_reconciliation', 'Asset reconciliation complete', 'inventory', 10, 'bump_out'),
  ('return_transport', 'Return transport complete', 'logistics', 8, 'bump_out'),
  ('damage_reporting', 'Damage report issued', 'safety', 6, 'bump_out'),
  ('supplier_settlement', 'Supplier settlement complete', 'budget', 8, 'closure'),
  ('final_cost', 'Final cost locked', 'budget', 8, 'closure'),
  ('profitability_review', 'Profitability reviewed', 'budget', 8, 'closure'),
  ('lessons_learned', 'Lessons learned recorded', 'approvals', 8, 'closure'),
  ('closure_signoff', 'Closure sign-off', 'approvals', 10, 'closure')
) AS v(code, title, category, weight, phase_code)
WHERE e.deleted_at IS NULL
ON CONFLICT (event_id, code) DO NOTHING;

-- Demo event stays on Pre-production (phase 6)
UPDATE public.events e
SET stage_id = s.id,
    lessons_learned = COALESCE(NULLIF(e.lessons_learned, ''), 'Load-in via service corridor 2 needs a dedicated marshal. Inflatable certs must be in-hand 72h before bump-in.')
FROM public.evt_stages s
WHERE e.event_number = 'EVT-2026-0001'
  AND e.deleted_at IS NULL
  AND s.code = 'pre_production';
