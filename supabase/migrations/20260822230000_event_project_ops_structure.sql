-- ============================================================
-- Event Project Management — ops structure (post Phase 4)
-- Standard workstreams, task ownership extras, issues, documents,
-- thin payables, asset movements, go-live. Does not rebuild budget.
-- ============================================================

-- ---------- Event master: go-live (bump-in/out map to existing dates) ----------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS go_live_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS go_live_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS go_live_approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ---------- WBS: identify seeded workstreams via existing code ----------
-- ---------- Tasks: remaining official fields ----------
ALTER TABLE public.event_tasks
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'not_required'
    CHECK (approval_status IN ('not_required', 'pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS delay_reason text,
  ADD COLUMN IF NOT EXISTS escalation_level text NOT NULL DEFAULT 'none'
    CHECK (escalation_level IN ('none', 'team', 'pm', 'director', 'exec')),
  ADD COLUMN IF NOT EXISTS cost_impact numeric(14,2),
  ADD COLUMN IF NOT EXISTS evidence_url text,
  ADD COLUMN IF NOT EXISTS is_snag boolean NOT NULL DEFAULT false;

-- ---------- Supporting team (multi staff) ----------
CREATE TABLE IF NOT EXISTS public.event_task_supporters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.event_tasks(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_event_task_supporters_task ON public.event_task_supporters (task_id);

-- ---------- Issues (open issues / snags) ----------
CREATE TABLE IF NOT EXISTS public.event_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  severity text NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'blocked', 'resolved', 'closed')),
  owner_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  due_date date,
  is_snag boolean NOT NULL DEFAULT false,
  is_safety boolean NOT NULL DEFAULT false,
  wbs_id uuid REFERENCES public.event_wbs_nodes(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_event_issues_event ON public.event_issues (event_id, status)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_event_issues_updated BEFORE UPDATE ON public.event_issues
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- Documents and drawings ----------
CREATE TABLE IF NOT EXISTS public.event_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title text NOT NULL,
  doc_type text NOT NULL DEFAULT 'other'
    CHECK (doc_type IN ('drawing', 'permit', 'contract', 'photo', 'manual', 'other')),
  url text,
  file_path text,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT event_documents_has_ref CHECK (url IS NOT NULL OR file_path IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_event_documents_event ON public.event_documents (event_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_event_documents_updated BEFORE UPDATE ON public.event_documents
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- Thin payables (PO / payment rows — not a second PO engine) ----------
CREATE TABLE IF NOT EXISTS public.event_payables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'payment'
    CHECK (kind IN ('po', 'payment')),
  title text NOT NULL,
  reference text,
  vendor_name text,
  amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'QAR',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'partial', 'paid', 'overdue', 'cancelled')),
  due_date date,
  po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_event_payables_event ON public.event_payables (event_id, status)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_event_payables_updated BEFORE UPDATE ON public.event_payables
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_po_event ON public.purchase_orders (event_id)
  WHERE event_id IS NOT NULL;

-- ---------- Asset movement (thin checklist — not a warehouse) ----------
CREATE TABLE IF NOT EXISTS public.event_asset_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  qty numeric(12,2) NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'moved', 'on_site', 'missing', 'returned')),
  due_date date,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_event_assets_event ON public.event_asset_movements (event_id, status)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_event_assets_updated BEFORE UPDATE ON public.event_asset_movements
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- Grants + RLS ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.event_task_supporters, public.event_issues, public.event_documents,
  public.event_payables, public.event_asset_movements
TO authenticated;

GRANT ALL ON
  public.event_task_supporters, public.event_issues, public.event_documents,
  public.event_payables, public.event_asset_movements
TO service_role;

ALTER TABLE public.event_task_supporters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_payables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_asset_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_children_task_supporters" ON public.event_task_supporters;
CREATE POLICY "event_children_task_supporters" ON public.event_task_supporters FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.event_tasks t
    JOIN public.events e ON e.id = t.event_id
    WHERE t.id = task_id AND public.user_can_access_location(e.location_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.event_tasks t
    JOIN public.events e ON e.id = t.event_id
    WHERE t.id = task_id AND public.user_can_access_location(e.location_id)
  ));

DROP POLICY IF EXISTS "event_children_issues" ON public.event_issues;
CREATE POLICY "event_children_issues" ON public.event_issues FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)));

DROP POLICY IF EXISTS "event_children_documents" ON public.event_documents;
CREATE POLICY "event_children_documents" ON public.event_documents FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)));

DROP POLICY IF EXISTS "event_children_payables" ON public.event_payables;
CREATE POLICY "event_children_payables" ON public.event_payables FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)));

DROP POLICY IF EXISTS "event_children_assets" ON public.event_asset_movements;
CREATE POLICY "event_children_assets" ON public.event_asset_movements FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)));

-- ---------- Go-live readiness + gate (additive — does not replace Phase 2 gates) ----------
INSERT INTO public.event_readiness_items (event_id, code, title, category, is_required, is_complete, weight)
SELECT e.id, 'go_live_approval', 'Go-live approval', 'approvals', true, COALESCE(e.go_live_approved, false), 12
FROM public.events e
WHERE e.deleted_at IS NULL
ON CONFLICT (event_id, code) DO NOTHING;

INSERT INTO public.evt_stage_gate_requirements (
  stage_id, code, label_en, label_ar, requirement_kind, readiness_code, is_blocking, threshold, sort_order
)
SELECT s.id, 'go_live_approval', 'Go-live approval', 'اعتماد الانطلاق', 'readiness_item', 'go_live_approval', true, NULL, 3
FROM public.evt_stages s
WHERE s.code = 'live_event'
ON CONFLICT (stage_id, code) DO NOTHING;

-- ---------- Standard workstreams for every existing event (incl. EVT-2026-0001) ----------
INSERT INTO public.event_wbs_nodes (event_id, parent_id, node_type, code, title, sort_order)
SELECT e.id, NULL, 'phase', v.code, v.title_en, v.sort_order
FROM public.events e
CROSS JOIN (VALUES
  ('project_approvals', 'Project and approvals', 1),
  ('venue_permits', 'Venue and permits', 2),
  ('design_branding', 'Design and branding', 3),
  ('procurement_finance', 'Procurement and finance', 4),
  ('production_fabrication', 'Production and fabrication', 5),
  ('it_pos', 'IT, POS and connectivity', 6),
  ('games_equipment', 'Games and technical equipment', 7),
  ('logistics_assets', 'Logistics and asset movement', 8),
  ('staffing_training', 'Staffing and training', 9),
  ('marketing_comms', 'Marketing and communication', 10),
  ('safety_quality', 'Safety and quality', 11),
  ('bump_in', 'Bump-in and installation', 12),
  ('live_ops', 'Live operations', 13),
  ('bump_out', 'Bump-out and closure', 14),
  ('critical_controls', 'Critical controls', 15)
) AS v(code, title_en, sort_order)
WHERE e.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.event_wbs_nodes n
    WHERE n.event_id = e.id AND n.deleted_at IS NULL AND n.code = v.code
  );

-- Demo rows on EVT-2026-0001 when that event already exists
INSERT INTO public.event_issues (event_id, title, severity, status, is_snag, is_safety)
SELECT e.id, 'Incomplete bumper pad on inflatable 3', 'high', 'open', true, true
FROM public.events e
WHERE e.event_number = 'EVT-2026-0001'
  AND NOT EXISTS (
    SELECT 1 FROM public.event_issues i WHERE i.event_id = e.id AND i.title = 'Incomplete bumper pad on inflatable 3'
  );

INSERT INTO public.event_documents (event_id, title, doc_type, file_path)
SELECT e.id, 'Site layout v1', 'drawing', 'events/EVT-2026-0001/site-layout.pdf'
FROM public.events e
WHERE e.event_number = 'EVT-2026-0001'
  AND NOT EXISTS (
    SELECT 1 FROM public.event_documents d WHERE d.event_id = e.id AND d.title = 'Site layout v1'
  );

INSERT INTO public.event_asset_movements (event_id, item_name, qty, status)
SELECT e.id, 'POS terminal kit', 2, 'planned'
FROM public.events e
WHERE e.event_number = 'EVT-2026-0001'
  AND NOT EXISTS (
    SELECT 1 FROM public.event_asset_movements a WHERE a.event_id = e.id AND a.item_name = 'POS terminal kit'
  );
