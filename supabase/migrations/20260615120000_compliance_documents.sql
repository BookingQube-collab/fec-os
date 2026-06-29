-- ============================================================
-- COMPLIANCE DOCUMENTS (mall certificates, QCDD, etc.)
-- ============================================================
CREATE TABLE public.compliance_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  issuing_authority text,
  reference_number text,
  notification_date date,
  submission_deadline date,
  issue_date date,
  expiry_date date,
  status text NOT NULL DEFAULT 'pending',
  file_path text,
  file_name text,
  file_mime text,
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_documents_location ON public.compliance_documents(location_id);
CREATE INDEX idx_compliance_documents_status ON public.compliance_documents(status);
CREATE INDEX idx_compliance_documents_submission_deadline ON public.compliance_documents(submission_deadline);
CREATE INDEX idx_compliance_documents_expiry_date ON public.compliance_documents(expiry_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_documents TO authenticated;
GRANT ALL ON public.compliance_documents TO service_role;
ALTER TABLE public.compliance_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "compliance_documents scoped" ON public.compliance_documents FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));
CREATE TRIGGER trg_compliance_documents_updated BEFORE UPDATE ON public.compliance_documents
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Status updates with audit trail
CREATE OR REPLACE FUNCTION public.update_compliance_document_status(
  _id uuid,
  _status text,
  _reason text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _row record;
BEGIN
  SELECT * INTO _row FROM public.compliance_documents WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT public.user_can_access_location(_row.location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.compliance_documents
  SET status = _status,
      submitted_at = CASE
        WHEN _status = 'submitted' AND submitted_at IS NULL THEN now()
        ELSE submitted_at
      END
  WHERE id = _id;
  PERFORM public.log_audit(
    'compliance_document.status_changed',
    'compliance_documents',
    _id,
    _row.location_id,
    to_jsonb(_row),
    jsonb_build_object('status', _status),
    _reason,
    '{}'::jsonb
  );
END; $$;

-- Storage bucket for compliance document uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'compliance-documents',
  'compliance-documents',
  false,
  20971520,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "compliance_documents_storage_read" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'compliance-documents');

CREATE POLICY "compliance_documents_storage_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'compliance-documents');

CREATE POLICY "compliance_documents_storage_delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'compliance-documents' AND public.current_user_role_level() >= 60);
