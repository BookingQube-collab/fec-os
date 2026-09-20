-- HR Documents v2: expand types, education/verify fields, soft-delete, expiry reminders.
-- Additive only — extends hr_employee_documents (no second documents system).

-- ---------------------------------------------------------------------------
-- Expand doc_type check (drop + recreate)
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_employee_documents
  DROP CONSTRAINT IF EXISTS hr_employee_documents_type_chk;

ALTER TABLE public.hr_employee_documents
  ADD CONSTRAINT hr_employee_documents_type_chk CHECK (doc_type IN (
    'cv',
    'qid',
    'passport',
    'visa',
    'secondment',
    'contract',
    'educational_certificate',
    'mofa_attested_certificate',
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

-- ---------------------------------------------------------------------------
-- Additive columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_employee_documents
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS supersedes_id uuid REFERENCES public.hr_employee_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS qualification text,
  ADD COLUMN IF NOT EXISTS institution text,
  ADD COLUMN IF NOT EXISTS graduation_year integer,
  ADD COLUMN IF NOT EXISTS mofa_status text,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verification_remarks text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS status_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_remarks text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_employee_documents_mofa_chk'
  ) THEN
    ALTER TABLE public.hr_employee_documents
      ADD CONSTRAINT hr_employee_documents_mofa_chk
      CHECK (mofa_status IS NULL OR mofa_status IN ('yes', 'no', 'not_required'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_employee_documents_verification_chk'
  ) THEN
    ALTER TABLE public.hr_employee_documents
      ADD CONSTRAINT hr_employee_documents_verification_chk
      CHECK (verification_status IN ('unverified', 'verified', 'rejected'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_employee_documents_status_chk'
  ) THEN
    ALTER TABLE public.hr_employee_documents
      ADD CONSTRAINT hr_employee_documents_status_chk
      CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'superseded'));
  END IF;
END $$;

-- Expiry index for active rows (keeps the earlier partial expiry index too)
CREATE INDEX IF NOT EXISTS idx_hr_employee_documents_expiry_active
  ON public.hr_employee_documents (expiry_date)
  WHERE expiry_date IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hr_employee_documents_deleted
  ON public.hr_employee_documents (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Expiry reminder tracking (milestone sends + acknowledgement)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_document_expiry_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.hr_employee_documents(id) ON DELETE CASCADE,
  milestone_days integer NOT NULL,
  channel text NOT NULL DEFAULT 'in_app',
  sent_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_document_expiry_reminders_channel_chk
    CHECK (channel IN ('in_app', 'email'))
);

CREATE INDEX IF NOT EXISTS idx_hr_document_expiry_reminders_doc
  ON public.hr_document_expiry_reminders (document_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_hr_document_expiry_reminders_ack
  ON public.hr_document_expiry_reminders (document_id)
  WHERE acknowledged_at IS NOT NULL;

ALTER TABLE public.hr_document_expiry_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_document_expiry_reminders read" ON public.hr_document_expiry_reminders;
CREATE POLICY "hr_document_expiry_reminders read" ON public.hr_document_expiry_reminders
  FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR EXISTS (
      SELECT 1 FROM public.hr_employee_documents d
      JOIN public.staff s ON s.id = d.staff_id
      WHERE d.id = document_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "hr_document_expiry_reminders write" ON public.hr_document_expiry_reminders;
CREATE POLICY "hr_document_expiry_reminders write" ON public.hr_document_expiry_reminders
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

-- Self-ack: employee may set acknowledged_at on reminders for their own docs
DROP POLICY IF EXISTS "hr_document_expiry_reminders self ack" ON public.hr_document_expiry_reminders;
CREATE POLICY "hr_document_expiry_reminders self ack" ON public.hr_document_expiry_reminders
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hr_employee_documents d
      JOIN public.staff s ON s.id = d.staff_id
      WHERE d.id = document_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hr_employee_documents d
      JOIN public.staff s ON s.id = d.staff_id
      WHERE d.id = document_id AND s.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.hr_document_expiry_reminders TO authenticated;
GRANT ALL ON public.hr_document_expiry_reminders TO service_role;
