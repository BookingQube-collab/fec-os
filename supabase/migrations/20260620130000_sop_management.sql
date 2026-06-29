-- ============================================================
-- Sprint 1: SOP management & acknowledgment foundation
-- ============================================================

CREATE TABLE public.sop_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  category text NOT NULL,
  department text,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  target_role public.app_role,
  scope text NOT NULL DEFAULT 'all_branches',
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  current_version int NOT NULL DEFAULT 1,
  effective_date date,
  review_date date,
  expiry_date date,
  mandatory_ack boolean NOT NULL DEFAULT true,
  requires_quiz boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sop_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.sop_documents(id) ON DELETE CASCADE,
  version int NOT NULL DEFAULT 1,
  sort_order int NOT NULL DEFAULT 0,
  heading text,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sop_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.sop_documents(id) ON DELETE CASCADE,
  version int NOT NULL,
  change_summary text,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version)
);

CREATE TABLE public.sop_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.sop_documents(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.staff(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  target_role public.app_role,
  due_date date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sop_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.sop_documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version int NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  read_at timestamptz,
  acknowledged_at timestamptz,
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, user_id, version)
);

CREATE TABLE public.sop_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.sop_documents(id) ON DELETE CASCADE,
  version int NOT NULL DEFAULT 1,
  passing_score int NOT NULL DEFAULT 80,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sop_quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.sop_quizzes(id) ON DELETE CASCADE,
  question text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]',
  correct_option int NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sop_quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.sop_quizzes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score int NOT NULL DEFAULT 0,
  passed boolean NOT NULL DEFAULT false,
  answers jsonb NOT NULL DEFAULT '{}',
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sop_documents_category ON public.sop_documents(category);
CREATE INDEX idx_sop_documents_location ON public.sop_documents(location_id);
CREATE INDEX idx_sop_ack_user ON public.sop_acknowledgments(user_id);
CREATE INDEX idx_sop_ack_status ON public.sop_acknowledgments(status);

-- RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.sop_documents, public.sop_sections, public.sop_versions,
  public.sop_assignments, public.sop_acknowledgments,
  public.sop_quizzes, public.sop_quiz_questions, public.sop_quiz_attempts
TO authenticated;
GRANT ALL ON
  public.sop_documents, public.sop_sections, public.sop_versions,
  public.sop_assignments, public.sop_acknowledgments,
  public.sop_quizzes, public.sop_quiz_questions, public.sop_quiz_attempts
TO service_role;

ALTER TABLE public.sop_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sop_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sop_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sop_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sop_acknowledgments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sop_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sop_quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sop_quiz_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sop_documents read" ON public.sop_documents FOR SELECT TO authenticated
  USING (
    location_id IS NULL OR public.user_can_access_location(location_id)
  );
CREATE POLICY "sop_documents write" ON public.sop_documents FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 70)
  WITH CHECK (public.current_user_role_level() >= 70);

CREATE POLICY "sop_sections read" ON public.sop_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "sop_sections write" ON public.sop_sections FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 70)
  WITH CHECK (public.current_user_role_level() >= 70);

CREATE POLICY "sop_versions read" ON public.sop_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "sop_versions write" ON public.sop_versions FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 70)
  WITH CHECK (public.current_user_role_level() >= 70);

CREATE POLICY "sop_assignments scoped" ON public.sop_assignments FOR ALL TO authenticated
  USING (location_id IS NULL OR public.user_can_access_location(location_id))
  WITH CHECK (location_id IS NULL OR public.user_can_access_location(location_id));

CREATE POLICY "sop_ack read own or manager" ON public.sop_acknowledgments FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.current_user_role_level() >= 60);
CREATE POLICY "sop_ack write own" ON public.sop_acknowledgments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sop_ack update own or manager" ON public.sop_acknowledgments FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.current_user_role_level() >= 60);

CREATE POLICY "sop_quizzes read" ON public.sop_quizzes FOR SELECT TO authenticated USING (true);
CREATE POLICY "sop_quizzes write" ON public.sop_quizzes FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 70)
  WITH CHECK (public.current_user_role_level() >= 70);

CREATE POLICY "sop_quiz_questions read" ON public.sop_quiz_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "sop_quiz_questions write" ON public.sop_quiz_questions FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 70)
  WITH CHECK (public.current_user_role_level() >= 70);

CREATE POLICY "sop_quiz_attempts own" ON public.sop_quiz_attempts FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_sop_documents_updated BEFORE UPDATE ON public.sop_documents
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_sop_ack_updated BEFORE UPDATE ON public.sop_acknowledgments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Storage bucket for SOP attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sop-documents',
  'sop-documents',
  false,
  20971520,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "sop docs storage read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'sop-documents');
CREATE POLICY "sop docs storage insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sop-documents' AND public.current_user_role_level() >= 60);
CREATE POLICY "sop docs storage delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'sop-documents' AND public.current_user_role_level() >= 80);

-- Seed default SOP categories/documents
INSERT INTO public.sop_documents (code, title, category, scope, status, mandatory_ack, effective_date, review_date) VALUES
  ('opening', 'Opening SOP', 'Operations', 'all_branches', 'published', true, CURRENT_DATE, CURRENT_DATE + 365),
  ('closing', 'Closing SOP', 'Operations', 'all_branches', 'published', true, CURRENT_DATE, CURRENT_DATE + 365),
  ('cash_handling', 'Cash Handling SOP', 'Finance', 'all_branches', 'published', true, CURRENT_DATE, CURRENT_DATE + 365),
  ('refund', 'Refund SOP', 'Finance', 'all_branches', 'published', true, CURRENT_DATE, CURRENT_DATE + 365),
  ('customer_complaint', 'Customer Complaint SOP', 'Customer Experience', 'all_branches', 'published', true, CURRENT_DATE, CURRENT_DATE + 365),
  ('incident_reporting', 'Incident Reporting SOP', 'Safety', 'all_branches', 'published', true, CURRENT_DATE, CURRENT_DATE + 365),
  ('emergency_evacuation', 'Emergency Evacuation SOP', 'Safety', 'all_branches', 'published', true, CURRENT_DATE, CURRENT_DATE + 365),
  ('lost_child', 'Lost Child SOP', 'Safety', 'all_branches', 'published', true, CURRENT_DATE, CURRENT_DATE + 365),
  ('kds_car_operation', 'KDS Car Operation SOP', 'Operations', 'all_branches', 'published', true, CURRENT_DATE, CURRENT_DATE + 365),
  ('machine_breakdown', 'Machine Breakdown SOP', 'Maintenance', 'all_branches', 'published', true, CURRENT_DATE, CURRENT_DATE + 365),
  ('preventive_maintenance', 'Preventive Maintenance SOP', 'Maintenance', 'all_branches', 'published', true, CURRENT_DATE, CURRENT_DATE + 365),
  ('cleaning', 'Cleaning SOP', 'Operations', 'all_branches', 'published', true, CURRENT_DATE, CURRENT_DATE + 365),
  ('inventory', 'Inventory SOP', 'Operations', 'all_branches', 'published', true, CURRENT_DATE, CURRENT_DATE + 365),
  ('vendor_followup', 'Vendor Follow-up SOP', 'Procurement', 'all_branches', 'published', true, CURRENT_DATE, CURRENT_DATE + 365),
  ('mall_communication', 'Mall Communication SOP', 'Compliance', 'all_branches', 'published', true, CURRENT_DATE, CURRENT_DATE + 365),
  ('fire_safety', 'Fire Safety SOP', 'Safety', 'all_branches', 'published', true, CURRENT_DATE, CURRENT_DATE + 365),
  ('pest_control', 'Pest Control SOP', 'Compliance', 'all_branches', 'published', true, CURRENT_DATE, CURRENT_DATE + 365),
  ('legal_renewal', 'Legal Document Renewal SOP', 'Compliance', 'all_branches', 'published', true, CURRENT_DATE, CURRENT_DATE + 365)
ON CONFLICT (code) DO NOTHING;

-- Seed section content for key SOPs
INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, 'Purpose', 'Standard procedure for ' || d.title || '. All staff must read and acknowledge before operating duties.'
FROM public.sop_documents d
WHERE NOT EXISTS (SELECT 1 FROM public.sop_sections s WHERE s.document_id = d.id);

INSERT INTO public.sop_versions (document_id, version, change_summary)
SELECT d.id, 1, 'Initial published version'
FROM public.sop_documents d
WHERE d.status = 'published'
  AND NOT EXISTS (SELECT 1 FROM public.sop_versions v WHERE v.document_id = d.id);
