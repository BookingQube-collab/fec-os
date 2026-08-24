-- ============================================================
-- Event Project Management — Phase 4
-- Budget hierarchy, revenue, client invoices, cost subcategories,
-- PR category link, budget baseline. Does not rebuild Phases 1–3.
-- ============================================================

-- ---------- Cost categories (spec list) ----------
INSERT INTO public.evt_cost_categories (code, label_en, label_ar, sort_order) VALUES
  ('venue', 'Venue', 'المكان', 10),
  ('production', 'Production', 'الإنتاج', 20),
  ('stage', 'Stage', 'المسرح', 30),
  ('av', 'AV', 'السمعي البصري', 40),
  ('sound', 'Sound', 'الصوت', 50),
  ('lighting', 'Lighting', 'الإضاءة', 60),
  ('led', 'LED', 'شاشات LED', 70),
  ('entertainment', 'Entertainment', 'الترفيه', 80),
  ('performers', 'Performers', 'المؤدون', 90),
  ('talent', 'Talent', 'المواهب', 100),
  ('manpower', 'Manpower', 'القوى العاملة', 110),
  ('security', 'Security', 'الأمن', 120),
  ('cleaning', 'Cleaning', 'النظافة', 130),
  ('logistics', 'Logistics', 'اللوجستيات', 140),
  ('transportation', 'Transportation', 'النقل', 150),
  ('vehicle_rental', 'Vehicle Rental', 'تأجير المركبات', 160),
  ('accommodation', 'Accommodation', 'الإقامة', 170),
  ('flights', 'Flights', 'الطيران', 180),
  ('printing', 'Printing', 'الطباعة', 190),
  ('branding', 'Branding', 'الهوية البصرية', 200),
  ('furniture', 'Furniture', 'الأثاث', 210),
  ('decoration', 'Decoration', 'الديكور', 220),
  ('catering', 'Catering', 'الضيافة', 230),
  ('technology', 'Technology', 'التقنية', 240),
  ('internet', 'Internet', 'الإنترنت', 250),
  ('power', 'Power', 'الكهرباء', 260),
  ('generator', 'Generator', 'المولد', 270),
  ('permits', 'Permits', 'التصاريح', 280),
  ('government_fees', 'Government Fees', 'الرسوم الحكومية', 290),
  ('insurance', 'Insurance', 'التأمين', 300),
  ('marketing', 'Marketing', 'التسويق', 310),
  ('agency_fees', 'Agency Fees', 'رسوم الوكالة', 320),
  ('equipment_rental', 'Equipment Rental', 'تأجير المعدات', 330),
  ('materials', 'Materials', 'المواد', 340),
  ('consumables', 'Consumables', 'المستهلكات', 350),
  ('miscellaneous', 'Miscellaneous', 'متنوعة', 360),
  ('contingency', 'Contingency', 'احتياطي', 370)
ON CONFLICT (code) DO UPDATE SET
  label_en = EXCLUDED.label_en,
  label_ar = EXCLUDED.label_ar,
  sort_order = EXCLUDED.sort_order,
  active = true;

UPDATE public.evt_cost_categories
SET active = false
WHERE code IN ('labor', 'equipment', 'decor', 'transport', 'fnb', 'other');

-- ---------- Subcategories ----------
CREATE TABLE IF NOT EXISTS public.evt_cost_subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.evt_cost_categories(id) ON DELETE CASCADE,
  code text NOT NULL,
  label_en text NOT NULL,
  label_ar text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (category_id, code)
);

CREATE INDEX IF NOT EXISTS idx_evt_cost_subcats_cat ON public.evt_cost_subcategories (category_id);

INSERT INTO public.evt_cost_subcategories (category_id, code, label_en, label_ar, sort_order)
SELECT c.id, v.code, v.label_en, v.label_ar, v.sort_order
FROM public.evt_cost_categories c
JOIN (VALUES
  ('venue', 'hall', 'Hall / indoor', 'قاعة / داخلي', 1),
  ('venue', 'outdoor', 'Outdoor space', 'مساحة خارجية', 2),
  ('production', 'general', 'General production', 'إنتاج عام', 1),
  ('manpower', 'crew', 'Crew', 'طاقم', 1),
  ('manpower', 'supervisors', 'Supervisors', 'مشرفون', 2),
  ('equipment_rental', 'inflatables', 'Inflatables', 'نطاطات', 1),
  ('equipment_rental', 'av_kit', 'AV / kit', 'صوتيات / عدة', 2),
  ('decoration', 'theming', 'Theming', 'ثيم', 1),
  ('transportation', 'freight', 'Freight', 'شحن', 1),
  ('permits', 'civil_defence', 'Civil Defence', 'الدفاع المدني', 1),
  ('marketing', 'print', 'Print', 'طباعة', 1),
  ('marketing', 'digital', 'Digital', 'رقمي', 2),
  ('catering', 'meals', 'Meals', 'وجبات', 1),
  ('contingency', 'reserve', 'Reserve', 'احتياطي', 1),
  ('security', 'guards', 'Guards', 'حراسة', 1),
  ('logistics', 'warehouse', 'Warehouse', 'مستودع', 1),
  ('lighting', 'fixtures', 'Fixtures', 'وحدات إضاءة', 1),
  ('sound', 'pa', 'PA system', 'نظام صوت', 1),
  ('talent', 'artists', 'Artists', 'فنانون', 1)
) AS v(cat_code, code, label_en, label_ar, sort_order)
  ON c.code = v.cat_code
ON CONFLICT (category_id, code) DO NOTHING;

-- ---------- Budget header: revenue + alert thresholds ----------
ALTER TABLE public.event_budgets
  ADD COLUMN IF NOT EXISTS contract_value numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS additional_revenue numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_change_orders numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discounts numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxes numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_alert_threshold_pct numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contingency_usage_threshold_pct numeric(6,2) NOT NULL DEFAULT 80;

UPDATE public.event_budgets b
SET contract_value = COALESCE(e.contracted_value, 0)
FROM public.events e
WHERE e.id = b.event_id AND b.contract_value = 0 AND e.contracted_value IS NOT NULL;

-- ---------- Budget lines: hierarchy + approved changes ----------
ALTER TABLE public.event_budget_lines
  ADD COLUMN IF NOT EXISTS subcategory_id uuid REFERENCES public.evt_cost_subcategories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS approved_changes numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;

ALTER TABLE public.event_budget_lines
  DROP CONSTRAINT IF EXISTS event_budget_lines_budget_id_category_id_key;

CREATE INDEX IF NOT EXISTS idx_event_budget_lines_cat ON public.event_budget_lines (budget_id, category_id);

UPDATE public.event_budget_lines
SET approved_changes = COALESCE(revised_amount, 0) - COALESCE(original_amount, 0)
WHERE approved_changes = 0 AND COALESCE(revised_amount, 0) <> COALESCE(original_amount, 0);

UPDATE public.event_budget_lines
SET revised_amount = COALESCE(original_amount, 0) + COALESCE(approved_changes, 0);

-- ---------- Client invoices (thin AR, not a full ERP) ----------
CREATE TABLE IF NOT EXISTS public.event_client_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  title text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'partial', 'paid', 'overdue')),
  amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'QAR',
  fx_rate numeric(12,6) NOT NULL DEFAULT 1 CHECK (fx_rate > 0),
  base_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (base_amount >= 0),
  paid_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  issue_date date,
  due_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (event_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_event_client_invoices_event ON public.event_client_invoices (event_id, status);

CREATE TRIGGER trg_event_client_invoices_updated BEFORE UPDATE ON public.event_client_invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- Budget baseline type ----------
ALTER TABLE public.event_baselines DROP CONSTRAINT IF EXISTS event_baselines_baseline_type_check;
ALTER TABLE public.event_baselines
  ADD CONSTRAINT event_baselines_baseline_type_check
  CHECK (baseline_type IN ('schedule', 'scope', 'both', 'budget'));

-- ---------- PR → cost category (optional, for remaining-budget warnings) ----------
ALTER TABLE public.purchase_requisitions
  ADD COLUMN IF NOT EXISTS cost_category_id uuid REFERENCES public.evt_cost_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pr_cost_category ON public.purchase_requisitions (cost_category_id)
  WHERE cost_category_id IS NOT NULL;

-- ---------- Grants + RLS ----------
GRANT SELECT ON public.evt_cost_subcategories TO authenticated;
GRANT INSERT, UPDATE ON public.evt_cost_subcategories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_client_invoices TO authenticated;
GRANT ALL ON public.evt_cost_subcategories, public.event_client_invoices TO service_role;

ALTER TABLE public.evt_cost_subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_client_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "evt_subcats_read" ON public.evt_cost_subcategories;
CREATE POLICY "evt_subcats_read" ON public.evt_cost_subcategories FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "evt_subcats_write_exec" ON public.evt_cost_subcategories;
CREATE POLICY "evt_subcats_write_exec" ON public.evt_cost_subcategories FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 80)
  WITH CHECK (public.current_user_role_level() >= 80);

DROP POLICY IF EXISTS "event_children_invoices" ON public.event_client_invoices;
CREATE POLICY "event_children_invoices" ON public.event_client_invoices FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)));
