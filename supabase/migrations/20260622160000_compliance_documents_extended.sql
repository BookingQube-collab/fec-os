-- ============================================================
-- Compliance documents: payments, vendors, AMC linkage, attachments, notifications
-- ============================================================

ALTER TABLE public.compliance_documents ADD COLUMN IF NOT EXISTS document_name text;
ALTER TABLE public.compliance_documents ADD COLUMN IF NOT EXISTS certificate_number text;
ALTER TABLE public.compliance_documents ADD COLUMN IF NOT EXISTS renewal_due_date date;
ALTER TABLE public.compliance_documents ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium';
ALTER TABLE public.compliance_documents ADD COLUMN IF NOT EXISTS responsible_person text;
ALTER TABLE public.compliance_documents ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL;
ALTER TABLE public.compliance_documents ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.amc_contracts(id) ON DELETE SET NULL;
ALTER TABLE public.compliance_documents ADD COLUMN IF NOT EXISTS quotation_amount numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.compliance_documents ADD COLUMN IF NOT EXISTS paid_amount numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.compliance_documents ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid';
ALTER TABLE public.compliance_documents ADD COLUMN IF NOT EXISTS renewal_status text NOT NULL DEFAULT 'active';
ALTER TABLE public.compliance_documents ADD COLUMN IF NOT EXISTS remarks text;

ALTER TABLE public.compliance_documents
  ADD COLUMN IF NOT EXISTS outstanding_amount numeric(14,2)
  GENERATED ALWAYS AS (GREATEST(COALESCE(quotation_amount, 0) - COALESCE(paid_amount, 0), 0)) STORED;

CREATE INDEX IF NOT EXISTS idx_compliance_documents_vendor ON public.compliance_documents(vendor_id);
CREATE INDEX IF NOT EXISTS idx_compliance_documents_contract ON public.compliance_documents(contract_id);
CREATE INDEX IF NOT EXISTS idx_compliance_documents_renewal_status ON public.compliance_documents(renewal_status);
CREATE INDEX IF NOT EXISTS idx_compliance_documents_payment_status ON public.compliance_documents(payment_status);

-- Extend vendors (third-party register fields)
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS trade_license_no text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS cr_no text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS service_category text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

UPDATE public.vendors SET status = CASE WHEN active THEN 'active' ELSE 'inactive' END WHERE status IS NULL;

-- Multi-attachment support per compliance document
CREATE TABLE IF NOT EXISTS public.document_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.compliance_documents(id) ON DELETE CASCADE,
  attachment_type text NOT NULL DEFAULT 'certificate',
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_mime text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_attachments_document ON public.document_attachments(document_id);
CREATE INDEX IF NOT EXISTS idx_document_attachments_type ON public.document_attachments(attachment_type);

-- Expiry notification tracking
CREATE TABLE IF NOT EXISTS public.document_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.compliance_documents(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  notification_date date NOT NULL,
  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, notification_type, notification_date)
);

CREATE INDEX IF NOT EXISTS idx_document_notifications_document ON public.document_notifications(document_id);
CREATE INDEX IF NOT EXISTS idx_document_notifications_date ON public.document_notifications(notification_date, status);

-- Enriched view for expiry tiers (documents register)
CREATE OR REPLACE VIEW public.compliance_documents_enriched AS
SELECT
  d.*,
  (d.expiry_date - CURRENT_DATE) AS days_to_expiry,
  CASE
    WHEN d.expiry_date IS NULL THEN 'No Date'
    WHEN d.expiry_date < CURRENT_DATE THEN 'Expired'
    WHEN d.expiry_date <= CURRENT_DATE + 7 THEN 'Due ≤7'
    WHEN d.expiry_date <= CURRENT_DATE + 15 THEN 'Due ≤15'
    WHEN d.expiry_date <= CURRENT_DATE + 30 THEN 'Due ≤30'
    WHEN d.expiry_date <= CURRENT_DATE + 60 THEN 'Due ≤60'
    WHEN d.expiry_date <= CURRENT_DATE + 90 THEN 'Due ≤90'
    ELSE 'Valid'
  END AS expiry_tier
FROM public.compliance_documents d;

GRANT SELECT ON public.compliance_documents_enriched TO authenticated, service_role;

-- Sync payment_status from amounts
CREATE OR REPLACE FUNCTION public.compliance_doc_sync_payment_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.paid_amount <= 0 OR NEW.quotation_amount <= 0 THEN
    NEW.payment_status := CASE WHEN NEW.paid_amount > 0 AND NEW.quotation_amount > 0 THEN 'partially_paid' ELSE 'unpaid' END;
  ELSIF NEW.paid_amount >= NEW.quotation_amount THEN
    NEW.payment_status := 'paid';
  ELSE
    NEW.payment_status := 'partially_paid';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compliance_doc_payment_status ON public.compliance_documents;
CREATE TRIGGER trg_compliance_doc_payment_status
  BEFORE INSERT OR UPDATE OF paid_amount, quotation_amount ON public.compliance_documents
  FOR EACH ROW EXECUTE FUNCTION public.compliance_doc_sync_payment_status();

-- RLS for new tables
ALTER TABLE public.document_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_attachments via document" ON public.document_attachments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.compliance_documents cd
      WHERE cd.id = document_id AND public.user_can_access_location(cd.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.compliance_documents cd
      WHERE cd.id = document_id AND public.user_can_access_location(cd.location_id)
    )
  );

CREATE POLICY "document_notifications via document" ON public.document_notifications FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.compliance_documents cd
      WHERE cd.id = document_id AND public.user_can_access_location(cd.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.compliance_documents cd
      WHERE cd.id = document_id AND public.user_can_access_location(cd.location_id)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_attachments, public.document_notifications TO authenticated;
GRANT ALL ON public.document_attachments, public.document_notifications TO service_role;
