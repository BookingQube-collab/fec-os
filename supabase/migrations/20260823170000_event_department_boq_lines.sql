-- ============================================================
-- Event PM: per-department BOQ (one file + line items each)
-- Uses existing event workstreams (event_wbs_nodes.code).
-- Replaces the single event-wide required BOQ placeholder.
-- ============================================================

ALTER TABLE public.event_documents
  ADD COLUMN IF NOT EXISTS workstream_code text,
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.master_departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_addendum boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_event_documents_event_ws
  ON public.event_documents (event_id, doc_type, workstream_code)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.event_boq_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.event_documents(id) ON DELETE CASCADE,
  workstream_code text,
  department_id uuid REFERENCES public.master_departments(id) ON DELETE SET NULL,
  line_no int NOT NULL DEFAULT 1,
  description text NOT NULL,
  qty numeric(14,3) NOT NULL DEFAULT 0,
  unit text,
  rate numeric(14,3),
  amount numeric(14,2) NOT NULL DEFAULT 0,
  cost_category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_event_boq_lines_event_ws
  ON public.event_boq_lines (event_id, workstream_code);

CREATE INDEX IF NOT EXISTS idx_event_boq_lines_document
  ON public.event_boq_lines (document_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_boq_lines TO authenticated;
GRANT ALL ON public.event_boq_lines TO service_role;

ALTER TABLE public.event_boq_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_children_boq_lines" ON public.event_boq_lines;
CREATE POLICY "event_children_boq_lines" ON public.event_boq_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.user_can_access_location(e.location_id)));

-- Retire the single generic missing BOQ so departments own the requirement
UPDATE public.event_documents
SET required = false,
    deleted_at = COALESCE(deleted_at, now()),
    updated_at = now()
WHERE doc_type = 'boq'
  AND deleted_at IS NULL
  AND workstream_code IS NULL
  AND file_path IS NULL
  AND url IS NULL
  AND status = 'missing';

-- Seed one required BOQ per workstream already on the event
INSERT INTO public.event_documents (
  event_id, title, doc_type, required, status, workstream_code, wbs_id
)
SELECT
  e.id,
  'BOQ — ' || n.title,
  'boq',
  true,
  'missing',
  n.code,
  n.id
FROM public.events e
JOIN public.event_wbs_nodes n
  ON n.event_id = e.id
 AND n.deleted_at IS NULL
 AND n.parent_id IS NULL
WHERE e.deleted_at IS NULL
  AND n.code IN (
    'operations',
    'project_management',
    'creative_branding',
    'production_technical',
    'it_pos',
    'procurement_finance',
    'logistics_warehouse',
    'hr_staffing',
    'marketing',
    'mall_venue',
    'vendors_contractors',
    'health_safety',
    'maintenance'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.event_documents d
    WHERE d.event_id = e.id
      AND d.deleted_at IS NULL
      AND d.doc_type = 'boq'
      AND d.workstream_code = n.code
  );
