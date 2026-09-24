-- People Directory HR fields: extend staff_profile_ext + document metadata.
-- Additive only — preserves staff.id and all FKs.

-- ---------------------------------------------------------------------------
-- staff_profile_ext: E3 masterfile / full HR profile fields
-- ---------------------------------------------------------------------------
ALTER TABLE public.staff_profile_ext
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS qid_expiry date,
  ADD COLUMN IF NOT EXISTS ticket_eligibility boolean,
  ADD COLUMN IF NOT EXISTS ticket_eligibility_months integer,
  ADD COLUMN IF NOT EXISTS ticket_amount numeric(12, 2),
  ADD COLUMN IF NOT EXISTS contract_start date,
  ADD COLUMN IF NOT EXISTS contract_end date,
  ADD COLUMN IF NOT EXISTS notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'staff_profile_ext_gender_chk'
  ) THEN
    ALTER TABLE public.staff_profile_ext
      ADD CONSTRAINT staff_profile_ext_gender_chk
      CHECK (gender IS NULL OR lower(gender) IN ('male', 'female', 'other', 'm', 'f'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'staff_profile_ext_ticket_months_chk'
  ) THEN
    ALTER TABLE public.staff_profile_ext
      ADD CONSTRAINT staff_profile_ext_ticket_months_chk
      CHECK (
        ticket_eligibility_months IS NULL
        OR (ticket_eligibility_months >= 1 AND ticket_eligibility_months <= 120)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_staff_profile_ext_qid_expiry
  ON public.staff_profile_ext (qid_expiry)
  WHERE qid_expiry IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_staff_profile_ext_passport_expiry
  ON public.staff_profile_ext (passport_expiry)
  WHERE passport_expiry IS NOT NULL;

-- ---------------------------------------------------------------------------
-- hr_employee_documents: number / issue / work_permit
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_employee_documents
  ADD COLUMN IF NOT EXISTS document_number text,
  ADD COLUMN IF NOT EXISTS issue_date date;

ALTER TABLE public.hr_employee_documents
  DROP CONSTRAINT IF EXISTS hr_employee_documents_type_chk;

ALTER TABLE public.hr_employee_documents
  ADD CONSTRAINT hr_employee_documents_type_chk CHECK (doc_type IN (
    'cv',
    'qid',
    'passport',
    'visa',
    'work_permit',
    'secondment',
    'contract',
    'educational_certificate',
    'mofa_attested_certificate',
    'health_certificate',
    'warning_letter',
    'increment_letter',
    'demotion_letter',
    'resignation_letter',
    'termination_letter',
    'medical_certificate',
    'leave_document',
    'air_ticket_receipt',
    'loan_document',
    'other'
  ));

COMMENT ON COLUMN public.staff_profile_ext.qid_expiry IS
  'QID expiry from E3 masterfile / HR docs; used for directory expiry KPIs.';
COMMENT ON COLUMN public.hr_employee_documents.document_number IS
  'Document / ID number (QID, passport, contract ref, etc.).';
COMMENT ON COLUMN public.hr_employee_documents.issue_date IS
  'Document issue date; must be on or before expiry_date when both set.';
