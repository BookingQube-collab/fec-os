-- Advanced HR: leave balances, employee documents, onboarding/offboarding,
-- announcements, OT policy summary. Safe to re-run. Does not alter punches/payroll workbooks.

-- ---------------------------------------------------------------------------
-- Leave balances (simple yearly allotments)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  leave_type text NOT NULL DEFAULT 'annual',
  period_year int NOT NULL,
  allotted_days numeric(5, 1) NOT NULL DEFAULT 21,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_leave_balances_type_chk CHECK (leave_type IN ('annual', 'sick', 'unpaid', 'emergency', 'other')),
  CONSTRAINT hr_leave_balances_year_chk CHECK (period_year BETWEEN 2020 AND 2100),
  CONSTRAINT hr_leave_balances_allotted_chk CHECK (allotted_days >= 0),
  UNIQUE (staff_id, leave_type, period_year)
);

CREATE INDEX IF NOT EXISTS idx_hr_leave_balances_staff
  ON public.hr_leave_balances (staff_id, period_year);

-- ---------------------------------------------------------------------------
-- Employee documents (contract / QID / passport)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  doc_type text NOT NULL DEFAULT 'other',
  title text,
  file_path text,
  file_name text,
  file_mime text,
  expiry_date date,
  notes text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_employee_documents_type_chk CHECK (doc_type IN ('contract', 'qid', 'passport', 'visa', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_hr_employee_documents_staff
  ON public.hr_employee_documents (staff_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hr_employee_documents_expiry
  ON public.hr_employee_documents (expiry_date)
  WHERE expiry_date IS NOT NULL;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hr-employee-documents',
  'hr-employee-documents',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Onboarding / offboarding checklists
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  title text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_checklist_templates_kind_chk CHECK (kind IN ('onboarding', 'offboarding'))
);

CREATE TABLE IF NOT EXISTS public.hr_checklist_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.hr_checklist_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.hr_staff_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.hr_checklist_templates(id) ON DELETE SET NULL,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_staff_checklists_kind_chk CHECK (kind IN ('onboarding', 'offboarding')),
  CONSTRAINT hr_staff_checklists_status_chk CHECK (status IN ('open', 'completed', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS public.hr_staff_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.hr_staff_checklists(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  sort_order int NOT NULL DEFAULT 0,
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT hr_staff_checklist_items_status_chk CHECK (status IN ('pending', 'done', 'skipped'))
);

CREATE INDEX IF NOT EXISTS idx_hr_staff_checklists_staff
  ON public.hr_staff_checklists (staff_id, kind, status);

-- Seed default templates (idempotent by title+kind)
INSERT INTO public.hr_checklist_templates (kind, title, sort_order)
SELECT v.kind, v.title, v.sort_order
FROM (
  VALUES
    ('onboarding'::text, 'New hire onboarding'::text, 1),
    ('offboarding'::text, 'Exit offboarding'::text, 1)
) AS v(kind, title, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_checklist_templates t
  WHERE t.kind = v.kind AND t.title = v.title
);

INSERT INTO public.hr_checklist_template_items (template_id, title, sort_order)
SELECT t.id, i.title, i.sort_order
FROM public.hr_checklist_templates t
JOIN (
  VALUES
    ('onboarding', 'Collect contract & ID copies', 1),
    ('onboarding', 'Create system login / link staff user', 2),
    ('onboarding', 'Assign site & shift', 3),
    ('onboarding', 'Enroll face / field check-in', 4),
    ('onboarding', 'Explain leave & OT policy', 5),
    ('offboarding', 'Collect company assets', 1),
    ('offboarding', 'Revoke system access', 2),
    ('offboarding', 'Final attendance & leave settlement', 3),
    ('offboarding', 'Exit interview / notes', 4)
) AS i(kind, title, sort_order) ON i.kind = t.kind
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_checklist_template_items x
  WHERE x.template_id = t.id AND x.title = i.title
);

-- ---------------------------------------------------------------------------
-- Announcements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  published_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_announcements_active
  ON public.hr_announcements (active, published_at DESC);

-- ---------------------------------------------------------------------------
-- OT policy summary (HR-facing, does not rebuild T&A engine)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_ot_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.hr_companies(id) ON DELETE CASCADE,
  overtime_after_minutes int NOT NULL DEFAULT 480,
  max_daily_ot_minutes int,
  max_weekly_ot_minutes int,
  requires_preapproval boolean NOT NULL DEFAULT false,
  summary_notes text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id),
  CONSTRAINT hr_ot_policy_after_chk CHECK (overtime_after_minutes BETWEEN 60 AND 1440)
);

INSERT INTO public.hr_ot_policy (company_id, overtime_after_minutes, summary_notes)
SELECT c.id, 480, 'OT accrues after standard shift worked minutes (default 480). Aligns with attendance shift templates.'
FROM public.hr_companies c
WHERE c.code = 'E3'
  AND NOT EXISTS (SELECT 1 FROM public.hr_ot_policy p WHERE p.company_id = c.id);

INSERT INTO public.hr_ot_policy (company_id, overtime_after_minutes, summary_notes)
SELECT NULL, 480, 'Default OT policy when no company row is set.'
WHERE NOT EXISTS (SELECT 1 FROM public.hr_ot_policy LIMIT 1);

-- ---------------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.hr_leave_balances,
  public.hr_employee_documents,
  public.hr_checklist_templates,
  public.hr_checklist_template_items,
  public.hr_staff_checklists,
  public.hr_staff_checklist_items,
  public.hr_announcements,
  public.hr_ot_policy
TO authenticated;

GRANT ALL ON
  public.hr_leave_balances,
  public.hr_employee_documents,
  public.hr_checklist_templates,
  public.hr_checklist_template_items,
  public.hr_staff_checklists,
  public.hr_staff_checklist_items,
  public.hr_announcements,
  public.hr_ot_policy
TO service_role;

ALTER TABLE public.hr_leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_employee_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_checklist_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_staff_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_staff_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_ot_policy ENABLE ROW LEVEL SECURITY;

-- Leave balances: self read, HR manage write
DROP POLICY IF EXISTS "hr_leave_balances read" ON public.hr_leave_balances;
CREATE POLICY "hr_leave_balances read" ON public.hr_leave_balances FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR staff_id IN (SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL)
  );

DROP POLICY IF EXISTS "hr_leave_balances write" ON public.hr_leave_balances;
CREATE POLICY "hr_leave_balances write" ON public.hr_leave_balances FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

-- Documents: self read, HR manage write
DROP POLICY IF EXISTS "hr_employee_documents read" ON public.hr_employee_documents;
CREATE POLICY "hr_employee_documents read" ON public.hr_employee_documents FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR staff_id IN (SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL)
  );

DROP POLICY IF EXISTS "hr_employee_documents write" ON public.hr_employee_documents;
CREATE POLICY "hr_employee_documents write" ON public.hr_employee_documents FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

-- Checklists: HR manage, employee can read own
DROP POLICY IF EXISTS "hr_checklist_templates read" ON public.hr_checklist_templates;
CREATE POLICY "hr_checklist_templates read" ON public.hr_checklist_templates FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "hr_checklist_templates write" ON public.hr_checklist_templates;
CREATE POLICY "hr_checklist_templates write" ON public.hr_checklist_templates FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_checklist_template_items read" ON public.hr_checklist_template_items;
CREATE POLICY "hr_checklist_template_items read" ON public.hr_checklist_template_items FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "hr_checklist_template_items write" ON public.hr_checklist_template_items;
CREATE POLICY "hr_checklist_template_items write" ON public.hr_checklist_template_items FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_staff_checklists read" ON public.hr_staff_checklists;
CREATE POLICY "hr_staff_checklists read" ON public.hr_staff_checklists FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR staff_id IN (SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL)
  );

DROP POLICY IF EXISTS "hr_staff_checklists write" ON public.hr_staff_checklists;
CREATE POLICY "hr_staff_checklists write" ON public.hr_staff_checklists FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_staff_checklist_items read" ON public.hr_staff_checklist_items;
CREATE POLICY "hr_staff_checklist_items read" ON public.hr_staff_checklist_items FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR checklist_id IN (
      SELECT c.id FROM public.hr_staff_checklists c
      JOIN public.staff s ON s.id = c.staff_id
      WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "hr_staff_checklist_items write" ON public.hr_staff_checklist_items;
CREATE POLICY "hr_staff_checklist_items write" ON public.hr_staff_checklist_items FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

-- Announcements: authenticated read active, HR write
DROP POLICY IF EXISTS "hr_announcements read" ON public.hr_announcements;
CREATE POLICY "hr_announcements read" ON public.hr_announcements FOR SELECT TO authenticated
  USING (active = true OR public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_announcements write" ON public.hr_announcements;
CREATE POLICY "hr_announcements write" ON public.hr_announcements FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

-- OT policy: authenticated read, HR write
DROP POLICY IF EXISTS "hr_ot_policy read" ON public.hr_ot_policy;
CREATE POLICY "hr_ot_policy read" ON public.hr_ot_policy FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "hr_ot_policy write" ON public.hr_ot_policy;
CREATE POLICY "hr_ot_policy write" ON public.hr_ot_policy FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

-- Storage policies for employee documents
DROP POLICY IF EXISTS "hr_employee_documents_storage_read" ON storage.objects;
CREATE POLICY "hr_employee_documents_storage_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'hr-employee-documents'
    AND (
      public.current_user_role_level() >= 55
      OR (storage.foldername(name))[1] IN (
        SELECT s.id::text FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
      )
    )
  );

DROP POLICY IF EXISTS "hr_employee_documents_storage_insert" ON storage.objects;
CREATE POLICY "hr_employee_documents_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'hr-employee-documents'
    AND public.current_user_role_level() >= 55
  );

DROP POLICY IF EXISTS "hr_employee_documents_storage_delete" ON storage.objects;
CREATE POLICY "hr_employee_documents_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'hr-employee-documents'
    AND public.current_user_role_level() >= 55
  );
