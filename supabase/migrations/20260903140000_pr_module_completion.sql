-- ============================================================
-- PR module completion — first-class title/purpose/vendor,
-- payment milestones + clearance, attachment types + storage,
-- vendor entity / compliance fields used on the PR wizard.
-- Does not drop existing PR, vendor, or DOA data.
-- ============================================================

ALTER TABLE public.purchase_requisitions
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS purpose_category text,
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS estimated_exposure numeric(14,2),
  ADD COLUMN IF NOT EXISTS payment_structure text NOT NULL DEFAULT 'post_delivery',
  ADD COLUMN IF NOT EXISTS payment_notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_requisitions_payment_structure_check'
  ) THEN
    ALTER TABLE public.purchase_requisitions
      ADD CONSTRAINT purchase_requisitions_payment_structure_check
      CHECK (payment_structure IN ('full_advance', 'milestones', 'post_delivery'));
  END IF;
END $$;

UPDATE public.purchase_requisitions
SET title = NULLIF(btrim(split_part(justification, E'\n\n', 1)), '')
WHERE title IS NULL AND justification IS NOT NULL AND justification <> '';

CREATE INDEX IF NOT EXISTS idx_pr_vendor ON public.purchase_requisitions (vendor_id)
  WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pr_purpose ON public.purchase_requisitions (purpose_category)
  WHERE purpose_category IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.pr_payment_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id uuid NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
  line_no int NOT NULL DEFAULT 1,
  title text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  due_timing text,
  due_date date,
  conditions text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'cleared', 'paid', 'cancelled')),
  paid_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  cleared_at timestamptz,
  cleared_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  paid_at timestamptz,
  paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  evidence_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pr_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_pr_milestones_pr ON public.pr_payment_milestones (pr_id, line_no);

CREATE TRIGGER trg_pr_milestones_updated
  BEFORE UPDATE ON public.pr_payment_milestones
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.pr_attachments
  ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS file_size int;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pr_attachments_doc_type_check'
  ) THEN
    ALTER TABLE public.pr_attachments
      ADD CONSTRAINT pr_attachments_doc_type_check
      CHECK (doc_type IN ('quotation', 'scope', 'comparison', 'clearance', 'other'));
  END IF;
END $$;

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS engagement_type text,
  ADD COLUMN IF NOT EXISTS compliance_deadline date,
  ADD COLUMN IF NOT EXISTS compliance_status text NOT NULL DEFAULT 'unassessed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendors_entity_type_check'
  ) THEN
    ALTER TABLE public.vendors
      ADD CONSTRAINT vendors_entity_type_check
      CHECK (entity_type IN ('company', 'freelancer'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendors_compliance_status_check'
  ) THEN
    ALTER TABLE public.vendors
      ADD CONSTRAINT vendors_compliance_status_check
      CHECK (compliance_status IN ('unassessed', 'grace', 'compliant', 'warning', 'blocked'));
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pr_payment_milestones TO authenticated;
GRANT ALL ON public.pr_payment_milestones TO service_role;

ALTER TABLE public.pr_payment_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pr_milestones via pr" ON public.pr_payment_milestones;
CREATE POLICY "pr_milestones via pr" ON public.pr_payment_milestones FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.purchase_requisitions p
    WHERE p.id = pr_id AND public.user_can_access_location(p.location_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.purchase_requisitions p
    WHERE p.id = pr_id AND public.user_can_access_location(p.location_id)
  ));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pr-attachments',
  'pr-attachments',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "pr_attachments_storage_read" ON storage.objects;
CREATE POLICY "pr_attachments_storage_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'pr-attachments');

DROP POLICY IF EXISTS "pr_attachments_storage_insert" ON storage.objects;
CREATE POLICY "pr_attachments_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pr-attachments');

DROP POLICY IF EXISTS "pr_attachments_storage_delete" ON storage.objects;
CREATE POLICY "pr_attachments_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'pr-attachments');
