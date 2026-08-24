-- ============================================================
-- PR & Procurement Control — Phase 1 foundation + Phase 2+ stubs
-- Reuses: staff, locations, master_departments, vendors, purchase_orders,
--         notifications, auth.users. Does NOT duplicate vendor/PO tables.
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS public.pr_number_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.next_pr_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  n bigint;
BEGIN
  n := nextval('public.pr_number_seq');
  RETURN 'PR-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(n::text, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.pr_insert_notification(
  _user_id uuid,
  _location_id uuid,
  _title text,
  _body text,
  _source_id uuid,
  _action_url text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  INSERT INTO public.notifications (
    user_id, location_id, category, title, body, severity,
    source_type, source_id, action_url
  ) VALUES (
    _user_id, _location_id, 'procurement', _title, _body, 'info',
    'purchase_requisition', _source_id, _action_url
  )
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

GRANT USAGE, SELECT ON SEQUENCE public.pr_number_seq TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_pr_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pr_insert_notification(uuid, uuid, text, text, uuid, text) TO authenticated;

-- ---------- Item master (Phase 2 stub, seeded for PR line categories) ----------
CREATE TABLE IF NOT EXISTS public.proc_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  unit text NOT NULL DEFAULT 'ea',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_proc_items_sku ON public.proc_items (sku) WHERE sku IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.proc_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid REFERENCES public.proc_items(id) ON DELETE SET NULL,
  item_name text,
  category text,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  unit_price numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'QAR',
  source text NOT NULL DEFAULT 'pr_approved',
  source_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_proc_price_history_item ON public.proc_price_history (item_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_proc_price_history_name ON public.proc_price_history (lower(item_name), recorded_at DESC);

-- ---------- Quotations (Phase 2 stub) ----------
CREATE TABLE IF NOT EXISTS public.proc_quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id uuid,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  quote_ref text,
  quote_date date,
  valid_until date,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'QAR',
  status text NOT NULL DEFAULT 'draft',
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.proc_quotation_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid NOT NULL REFERENCES public.proc_quotations(id) ON DELETE CASCADE,
  line_no int NOT NULL DEFAULT 1,
  item_id uuid REFERENCES public.proc_items(id) ON DELETE SET NULL,
  name text NOT NULL,
  qty numeric(14,3) NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'ea',
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) GENERATED ALWAYS AS (ROUND(qty * unit_price, 2)) STORED,
  remarks text
);

-- ---------- Budgets (Phase 3 stub) ----------
CREATE TABLE IF NOT EXISTS public.proc_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.master_departments(id) ON DELETE SET NULL,
  fiscal_year int NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::int,
  cost_center text,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'QAR',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.proc_budget_commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES public.proc_budgets(id) ON DELETE CASCADE,
  pr_id uuid,
  amount numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'committed'
    CHECK (status IN ('committed', 'released', 'consumed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- DOA matrix (configurable, not hardcoded in app logic) ----------
CREATE TABLE IF NOT EXISTS public.pr_doa_matrix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  band_code text NOT NULL UNIQUE,
  label text NOT NULL,
  min_amount numeric(14,2) NOT NULL DEFAULT 0,
  max_amount numeric(14,2),
  require_dept_head boolean NOT NULL DEFAULT true,
  require_gm boolean NOT NULL DEFAULT false,
  require_ceo boolean NOT NULL DEFAULT false,
  require_finance boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pr_doa_finance_required CHECK (require_finance = true),
  CONSTRAINT pr_doa_max_gte_min CHECK (max_amount IS NULL OR max_amount >= min_amount)
);

CREATE TABLE IF NOT EXISTS public.pr_doa_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  price_variance_pct_threshold numeric(6,2) NOT NULL DEFAULT 15,
  force_ceo_on_price_variance boolean NOT NULL DEFAULT true,
  force_ceo_on_budget_exception boolean NOT NULL DEFAULT true,
  finance_always_required boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Purchase requisitions ----------
CREATE TABLE IF NOT EXISTS public.purchase_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_number text UNIQUE,
  requested_at date NOT NULL DEFAULT CURRENT_DATE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  requester_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.master_departments(id) ON DELETE SET NULL,
  cost_center text,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  project_name text,
  request_type text NOT NULL DEFAULT 'goods'
    CHECK (request_type IN ('goods', 'services', 'mixed')),
  spend_type text NOT NULL DEFAULT 'opex'
    CHECK (spend_type IN ('opex', 'capex')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'emergency')),
  emergency boolean NOT NULL DEFAULT false,
  required_by date,
  justification text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'submitted', 'dept_review', 'gm_review', 'ceo_review',
      'finance_review', 'procurement_review', 'approved', 'rejected',
      'returned', 'on_hold', 'po_created', 'cancelled'
    )),
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'QAR',
  current_step_role text,
  budget_exception boolean NOT NULL DEFAULT false,
  price_variance_flag boolean NOT NULL DEFAULT false,
  hold_reason text,
  po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pr_location_status ON public.purchase_requisitions (location_id, status);
CREATE INDEX IF NOT EXISTS idx_pr_requested_by ON public.purchase_requisitions (requested_by);
CREATE INDEX IF NOT EXISTS idx_pr_required_by ON public.purchase_requisitions (required_by) WHERE status NOT IN ('approved', 'rejected', 'cancelled', 'po_created');

CREATE TABLE IF NOT EXISTS public.pr_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id uuid NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
  line_no int NOT NULL DEFAULT 1,
  item_id uuid REFERENCES public.proc_items(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  category text,
  qty numeric(14,3) NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit text NOT NULL DEFAULT 'ea',
  unit_price numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  line_total numeric(14,2) GENERATED ALWAYS AS (ROUND(qty * unit_price, 2)) STORED,
  preferred_vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  remarks text,
  UNIQUE (pr_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_pr_lines_pr ON public.pr_lines (pr_id);

CREATE TABLE IF NOT EXISTS public.pr_approval_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id uuid NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  step_role text NOT NULL
    CHECK (step_role IN ('dept_head', 'gm', 'ceo', 'finance')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'skipped', 'rejected')),
  acted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acted_at timestamptz,
  comments text,
  UNIQUE (pr_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_pr_steps_pending ON public.pr_approval_steps (step_role, status);

CREATE TABLE IF NOT EXISTS public.pr_approval_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id uuid NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
  step_id uuid REFERENCES public.pr_approval_steps(id) ON DELETE SET NULL,
  action text NOT NULL,
  from_status text,
  to_status text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  comments text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pr_history_pr ON public.pr_approval_history (pr_id, created_at);

CREATE TABLE IF NOT EXISTS public.pr_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  pr_id uuid,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  before jsonb,
  after jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pr_audit_pr ON public.pr_audit_logs (pr_id, created_at);

CREATE TABLE IF NOT EXISTS public.pr_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id uuid NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_mime text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- quotations.pr_id FK after PRs exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'proc_quotations_pr_id_fkey'
  ) THEN
    ALTER TABLE public.proc_quotations
      ADD CONSTRAINT proc_quotations_pr_id_fkey
      FOREIGN KEY (pr_id) REFERENCES public.purchase_requisitions(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'proc_budget_commitments_pr_id_fkey'
  ) THEN
    ALTER TABLE public.proc_budget_commitments
      ADD CONSTRAINT proc_budget_commitments_pr_id_fkey
      FOREIGN KEY (pr_id) REFERENCES public.purchase_requisitions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.tg_pr_recalc_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  _pr uuid;
BEGIN
  _pr := COALESCE(NEW.pr_id, OLD.pr_id);
  UPDATE public.purchase_requisitions
  SET total_amount = COALESCE((
    SELECT SUM(line_total) FROM public.pr_lines WHERE pr_id = _pr
  ), 0)
  WHERE id = _pr;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_pr_lines_total ON public.pr_lines;
CREATE TRIGGER trg_pr_lines_total
  AFTER INSERT OR UPDATE OR DELETE ON public.pr_lines
  FOR EACH ROW EXECUTE FUNCTION public.tg_pr_recalc_total();

CREATE TRIGGER trg_pr_updated BEFORE UPDATE ON public.purchase_requisitions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_pr_doa_updated BEFORE UPDATE ON public.pr_doa_matrix
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_proc_items_updated BEFORE UPDATE ON public.proc_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_proc_quotes_updated BEFORE UPDATE ON public.proc_quotations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_proc_budgets_updated BEFORE UPDATE ON public.proc_budgets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- Grants + RLS ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.proc_items, public.proc_quotations, public.proc_quotation_lines,
  public.proc_budgets, public.proc_budget_commitments,
  public.pr_doa_matrix, public.pr_doa_settings,
  public.purchase_requisitions, public.pr_lines, public.pr_approval_steps,
  public.pr_approval_history, public.pr_attachments
TO authenticated;

GRANT SELECT, INSERT ON public.proc_price_history, public.pr_audit_logs TO authenticated;

GRANT ALL ON
  public.proc_items, public.proc_price_history, public.proc_quotations, public.proc_quotation_lines,
  public.proc_budgets, public.proc_budget_commitments,
  public.pr_doa_matrix, public.pr_doa_settings,
  public.purchase_requisitions, public.pr_lines, public.pr_approval_steps,
  public.pr_approval_history, public.pr_audit_logs, public.pr_attachments
TO service_role;

ALTER TABLE public.proc_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proc_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proc_quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proc_quotation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proc_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proc_budget_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pr_doa_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pr_doa_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pr_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pr_approval_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pr_approval_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pr_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pr_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "proc_items read" ON public.proc_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "proc_items write exec" ON public.proc_items FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 80)
  WITH CHECK (public.current_user_role_level() >= 80);

CREATE POLICY "proc_price_history read" ON public.proc_price_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "proc_price_history insert" ON public.proc_price_history FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "pr_doa read" ON public.pr_doa_matrix FOR SELECT TO authenticated USING (true);
CREATE POLICY "pr_doa write exec" ON public.pr_doa_matrix FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 80)
  WITH CHECK (public.current_user_role_level() >= 80);

CREATE POLICY "pr_doa_settings read" ON public.pr_doa_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "pr_doa_settings write exec" ON public.pr_doa_settings FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 80)
  WITH CHECK (public.current_user_role_level() >= 80);

CREATE POLICY "pr scoped" ON public.purchase_requisitions FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

CREATE POLICY "pr_lines via pr" ON public.pr_lines FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.purchase_requisitions p
    WHERE p.id = pr_id AND public.user_can_access_location(p.location_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.purchase_requisitions p
    WHERE p.id = pr_id AND public.user_can_access_location(p.location_id)
  ));

CREATE POLICY "pr_steps via pr" ON public.pr_approval_steps FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.purchase_requisitions p
    WHERE p.id = pr_id AND public.user_can_access_location(p.location_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.purchase_requisitions p
    WHERE p.id = pr_id AND public.user_can_access_location(p.location_id)
  ));

CREATE POLICY "pr_history via pr" ON public.pr_approval_history FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.purchase_requisitions p
    WHERE p.id = pr_id AND public.user_can_access_location(p.location_id)
  ));
CREATE POLICY "pr_history insert" ON public.pr_approval_history FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.purchase_requisitions p
    WHERE p.id = pr_id AND public.user_can_access_location(p.location_id)
  ));

CREATE POLICY "pr_audit read" ON public.pr_audit_logs FOR SELECT TO authenticated
  USING (location_id IS NULL OR public.user_can_access_location(location_id));
CREATE POLICY "pr_audit insert" ON public.pr_audit_logs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "pr_attachments via pr" ON public.pr_attachments FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.purchase_requisitions p
    WHERE p.id = pr_id AND public.user_can_access_location(p.location_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.purchase_requisitions p
    WHERE p.id = pr_id AND public.user_can_access_location(p.location_id)
  ));

CREATE POLICY "proc_quotes read" ON public.proc_quotations FOR SELECT TO authenticated USING (true);
CREATE POLICY "proc_quotes write" ON public.proc_quotations FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 60)
  WITH CHECK (public.current_user_role_level() >= 60);
CREATE POLICY "proc_quote_lines via quote" ON public.proc_quotation_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "proc_budgets scoped" ON public.proc_budgets FOR ALL TO authenticated
  USING (location_id IS NULL OR public.user_can_access_location(location_id))
  WITH CHECK (location_id IS NULL OR public.user_can_access_location(location_id));
CREATE POLICY "proc_commitments via budget" ON public.proc_budget_commitments FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.proc_budgets b
    WHERE b.id = budget_id AND (b.location_id IS NULL OR public.user_can_access_location(b.location_id))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.proc_budgets b
    WHERE b.id = budget_id AND (b.location_id IS NULL OR public.user_can_access_location(b.location_id))
  ));

-- Immutable audit / price history: no UPDATE or DELETE policies (RLS default deny)

-- ---------- Seed DOA + settings + sample items ----------
INSERT INTO public.pr_doa_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pr_doa_matrix (
  band_code, label, min_amount, max_amount,
  require_dept_head, require_gm, require_ceo, require_finance, sort_order
) VALUES
  ('low', 'Dept Head band', 0, 5000, true, false, false, true, 1),
  ('medium', 'GM band', 5000.01, 20000, true, true, false, true, 2),
  ('high', 'CEO band', 20000.01, NULL, true, true, true, true, 3)
ON CONFLICT (band_code) DO NOTHING;

INSERT INTO public.proc_items (sku, name, category, unit)
SELECT v.sku, v.name, v.category, v.unit
FROM (VALUES
  ('FEC-FNB-001', 'F&B consumables', 'fnb', 'lot'),
  ('FEC-MNT-001', 'Maintenance spares', 'maintenance', 'ea'),
  ('FEC-ATT-001', 'Attraction parts', 'attractions', 'ea'),
  ('FEC-IT-001', 'IT hardware / POS', 'it', 'ea'),
  ('FEC-UNI-001', 'Staff uniforms', 'uniforms', 'ea'),
  ('FEC-CLN-001', 'Cleaning supplies', 'cleaning', 'lot'),
  ('FEC-MKT-001', 'Marketing / print', 'marketing', 'lot'),
  ('FEC-SVC-001', 'Professional services', 'services', 'job')
) AS v(sku, name, category, unit)
WHERE NOT EXISTS (SELECT 1 FROM public.proc_items i WHERE i.sku = v.sku);
