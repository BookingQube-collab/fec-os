-- Training engine (phase 2): catalog, assignments, enrollments, assessments, certificates.
-- Platform domain. Reuses staff, locations, master_departments, user_roles,
-- user_can_access_location, user_can_access_staff, role_capability_grants,
-- public.notifications (no training notification table), public.log_audit,
-- and the private Storage bucket below.
--
-- Legacy public.training_enrollments and public.complete_training are a
-- free-text HR list. This migration does not alter them and does not read them.
-- Learner identity is public.staff.user_id. There is no learner profile table.
--
-- Authenticated clients have no INSERT/UPDATE/DELETE on enrollments, progress,
-- attempts, practical assessments, certificates, or competencies.
-- Completion, scores, and certificates change only inside SECURITY DEFINER
-- functions that set the transaction-local training.authoritative_write flag.
-- This phase's RPCs refuse client completion flags and do not write.
-- Certificate rows are never deleted. Public verification is by a random token,
-- not by certificate id or a sequence.

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

CREATE TABLE public.training_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  summary text,
  status text NOT NULL DEFAULT 'DRAFT',
  published_version_id uuid,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_courses_status_chk CHECK (
    status IN ('DRAFT', 'UNDER_REVIEW', 'PUBLISHED', 'ARCHIVED')
  )
);

CREATE TABLE public.training_course_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
  version_no integer NOT NULL CHECK (version_no > 0),
  status text NOT NULL DEFAULT 'DRAFT',
  title text NOT NULL,
  change_summary text,
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, version_no),
  CONSTRAINT training_versions_status_chk CHECK (
    status IN ('DRAFT', 'UNDER_REVIEW', 'PUBLISHED', 'ARCHIVED')
  )
);

ALTER TABLE public.training_courses
  ADD CONSTRAINT training_courses_published_version_fkey
  FOREIGN KEY (published_version_id)
  REFERENCES public.training_course_versions(id)
  ON DELETE SET NULL;

CREATE TABLE public.training_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.training_course_versions(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.training_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.training_sections(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'TEXT',
  body text,
  storage_path text,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_lessons_kind_chk CHECK (
    kind IN ('TEXT', 'DOCUMENT', 'VIDEO', 'QUIZ', 'PRACTICAL')
  ),
  CONSTRAINT training_lessons_storage_path_chk CHECK (
    storage_path IS NULL OR storage_path !~* '^https?://'
  )
);

COMMENT ON COLUMN public.training_lessons.storage_path IS
  'Object path in the private training-materials bucket. Not a public URL. Signed URLs are a later phase.';

CREATE TABLE public.training_paths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  summary text,
  status text NOT NULL DEFAULT 'DRAFT',
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_paths_status_chk CHECK (
    status IN ('DRAFT', 'UNDER_REVIEW', 'PUBLISHED', 'ARCHIVED')
  )
);

CREATE TABLE public.training_path_items (
  path_id uuid NOT NULL REFERENCES public.training_paths(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.training_courses(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (path_id, course_id)
);

-- ---------------------------------------------------------------------------
-- Assignment rules. Expansion into enrollment rows is a later phase.
-- That phase must call user_can_access_staff for each employee unless the
-- actor has training.assign.company. This migration only stores the rules.
-- TEAM and BUSINESS_UNIT are labels: there is no team or business-unit master.
-- ROLE stores app_role or staff_role text. EMPLOYEE_TYPE matches staff.employment_type.
-- DEPARTMENT references master_departments. SITE references locations.
-- ---------------------------------------------------------------------------

CREATE TABLE public.training_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES public.training_courses(id) ON DELETE RESTRICT,
  path_id uuid REFERENCES public.training_paths(id) ON DELETE RESTRICT,
  due_on date,
  required boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_assignments_subject_chk CHECK (num_nonnulls(course_id, path_id) = 1)
);

CREATE TABLE public.training_assignment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.training_assignments(id) ON DELETE CASCADE,
  target text NOT NULL,
  staff_id uuid REFERENCES public.staff(id) ON DELETE RESTRICT,
  department_id uuid REFERENCES public.master_departments(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT,
  role_code text,
  business_unit text,
  team_label text,
  employment_type text,
  custom_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_assignment_rules_target_chk CHECK (target IN (
    'EMPLOYEE', 'DEPARTMENT', 'ROLE', 'SITE', 'BUSINESS_UNIT', 'TEAM', 'EMPLOYEE_TYPE', 'CUSTOM', 'COMPANY'
  )),
  CONSTRAINT training_assignment_rules_shape_chk CHECK (
    (target = 'EMPLOYEE' AND staff_id IS NOT NULL)
    OR (target = 'DEPARTMENT' AND department_id IS NOT NULL)
    OR (target = 'ROLE' AND role_code IS NOT NULL)
    OR (target = 'SITE' AND location_id IS NOT NULL)
    OR (target = 'BUSINESS_UNIT' AND business_unit IS NOT NULL)
    OR (target = 'TEAM' AND team_label IS NOT NULL)
    OR (target = 'EMPLOYEE_TYPE' AND employment_type IS NOT NULL)
    OR (target = 'CUSTOM' AND custom_label IS NOT NULL)
    OR (
      target = 'COMPANY'
      AND staff_id IS NULL
      AND department_id IS NULL
      AND location_id IS NULL
      AND role_code IS NULL
      AND business_unit IS NULL
      AND team_label IS NULL
      AND employment_type IS NULL
      AND custom_label IS NULL
    )
  )
);

-- ---------------------------------------------------------------------------
-- Enrollments and learner state. Distinct from public.training_enrollments.
-- ---------------------------------------------------------------------------

CREATE TABLE public.training_course_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  course_id uuid NOT NULL REFERENCES public.training_courses(id) ON DELETE RESTRICT,
  version_id uuid NOT NULL REFERENCES public.training_course_versions(id) ON DELETE RESTRICT,
  assignment_id uuid REFERENCES public.training_assignments(id) ON DELETE SET NULL,
  path_id uuid REFERENCES public.training_paths(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ENROLLED',
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  due_on date,
  completed_at timestamptz,
  score numeric CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, version_id),
  CONSTRAINT training_enrollments_status_chk CHECK (
    status IN ('ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED', 'WAIVED')
  )
);

CREATE TABLE public.training_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.training_course_enrollments(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.training_lessons(id) ON DELETE RESTRICT,
  position_seconds integer NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, lesson_id)
);

CREATE TABLE public.training_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.training_course_versions(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  kind text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  points numeric NOT NULL DEFAULT 1 CHECK (points >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_questions_kind_chk CHECK (
    kind IN ('SINGLE', 'MULTI', 'TRUE_FALSE', 'SHORT')
  ),
  CONSTRAINT training_questions_options_chk CHECK (jsonb_typeof(options) = 'array')
);

COMMENT ON TABLE public.training_questions IS
  'Question stems and choices. Correct answers live only in training_question_keys.';

CREATE TABLE public.training_question_keys (
  question_id uuid PRIMARY KEY REFERENCES public.training_questions(id) ON DELETE CASCADE,
  correct jsonb NOT NULL,
  CONSTRAINT training_question_keys_obj_chk CHECK (jsonb_typeof(correct) = 'object' OR jsonb_typeof(correct) = 'array')
);

CREATE TABLE public.training_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.training_course_enrollments(id) ON DELETE CASCADE,
  question_id uuid REFERENCES public.training_questions(id) ON DELETE RESTRICT,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  score numeric CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  passed boolean,
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  CONSTRAINT training_attempts_answers_chk CHECK (jsonb_typeof(answers) = 'array')
);

CREATE TABLE public.training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.training_courses(id) ON DELETE RESTRICT,
  version_id uuid NOT NULL REFERENCES public.training_course_versions(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  trainer_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  status text NOT NULL DEFAULT 'SCHEDULED',
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_sessions_status_chk CHECK (status IN ('SCHEDULED', 'CANCELLED', 'COMPLETED')),
  CONSTRAINT training_sessions_window_chk CHECK (ends_at > starts_at)
);

CREATE TABLE public.training_attendance (
  session_id uuid NOT NULL REFERENCES public.training_sessions(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  status text NOT NULL,
  marked_by uuid NOT NULL REFERENCES auth.users(id),
  marked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, staff_id),
  CONSTRAINT training_attendance_status_chk CHECK (status IN ('PRESENT', 'ABSENT', 'EXCUSED'))
);

CREATE TABLE public.training_practical_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.training_course_enrollments(id) ON DELETE CASCADE,
  assessor_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  rubric jsonb NOT NULL DEFAULT '{}'::jsonb,
  score numeric CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  passed boolean,
  notes text,
  assessed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_practical_rubric_chk CHECK (jsonb_typeof(rubric) = 'object')
);

CREATE TABLE public.training_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL UNIQUE REFERENCES public.training_course_enrollments(id) ON DELETE RESTRICT,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  course_id uuid NOT NULL REFERENCES public.training_courses(id) ON DELETE RESTRICT,
  holder_name text NOT NULL,
  course_title text NOT NULL,
  status text NOT NULL DEFAULT 'VALID',
  issued_at timestamptz NOT NULL DEFAULT now(),
  valid_until date,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id),
  revoke_reason text,
  public_token text NOT NULL UNIQUE DEFAULT (
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
  ),
  CONSTRAINT training_certificates_status_chk CHECK (status IN ('VALID', 'EXPIRED', 'REVOKED')),
  CONSTRAINT training_certificates_token_chk CHECK (public_token ~ '^[0-9a-f]{64}$'),
  CONSTRAINT training_certificates_revoke_chk CHECK (
    (status = 'REVOKED' AND revoked_at IS NOT NULL AND revoke_reason IS NOT NULL)
    OR (status <> 'REVOKED' AND revoked_at IS NULL AND revoke_reason IS NULL)
  )
);

COMMENT ON COLUMN public.training_certificates.public_token IS
  'Non-sequential verification token. Not the row id and not a sequence. Public lookup uses only this value.';

COMMENT ON COLUMN public.training_certificates.holder_name IS
  'Display name snapshot for verification. Do not store QID, passport, phone, email, or salary here.';

CREATE TABLE public.training_competencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  enrollment_id uuid REFERENCES public.training_course_enrollments(id) ON DELETE RESTRICT,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  expires_on date,
  UNIQUE (staff_id, code, enrollment_id)
);

CREATE TABLE public.training_entity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES public.training_courses(id) ON DELETE CASCADE,
  enrollment_id uuid REFERENCES public.training_course_enrollments(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_entity_links_parent_chk CHECK (course_id IS NOT NULL OR enrollment_id IS NOT NULL),
  CONSTRAINT training_entity_links_type_chk CHECK (
    entity_type IN ('SOP', 'ASSET', 'TICKET', 'EVENT', 'MAINTENANCE', 'LOCATION', 'DEPARTMENT')
  )
);

COMMENT ON TABLE public.training_entity_links IS
  'Pointer to an existing FEC record. No copied SOP, asset, or HR payload.';

CREATE TABLE public.training_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.training_course_enrollments(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, staff_id)
);

CREATE TABLE public.training_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  table_name text NOT NULL,
  row_id uuid,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.training_audit_logs IS
  'Append-only training trail. Inserts go through training_write_audit, which also calls public.log_audit. Update and delete always fail.';

CREATE INDEX training_courses_status_idx ON public.training_courses (status);
CREATE INDEX training_versions_course_idx ON public.training_course_versions (course_id, status);
CREATE INDEX training_sections_version_idx ON public.training_sections (version_id, sort_order);
CREATE INDEX training_lessons_section_idx ON public.training_lessons (section_id, sort_order);
CREATE INDEX training_path_items_course_idx ON public.training_path_items (course_id);
CREATE INDEX training_assignment_rules_assignment_idx ON public.training_assignment_rules (assignment_id);
CREATE INDEX training_assignment_rules_location_idx ON public.training_assignment_rules (location_id) WHERE location_id IS NOT NULL;
CREATE INDEX training_assignment_rules_staff_idx ON public.training_assignment_rules (staff_id) WHERE staff_id IS NOT NULL;
CREATE INDEX training_enrollments_staff_idx ON public.training_course_enrollments (staff_id, status);
CREATE INDEX training_enrollments_course_idx ON public.training_course_enrollments (course_id);
CREATE INDEX training_questions_version_idx ON public.training_questions (version_id, sort_order);
CREATE INDEX training_attempts_enrollment_idx ON public.training_attempts (enrollment_id);
CREATE INDEX training_sessions_location_idx ON public.training_sessions (location_id, starts_at);
CREATE INDEX training_certificates_staff_idx ON public.training_certificates (staff_id);
CREATE INDEX training_competencies_staff_idx ON public.training_competencies (staff_id, code);
CREATE INDEX training_audit_logs_created_idx ON public.training_audit_logs (created_at DESC);

-- ---------------------------------------------------------------------------
-- Capability mirror. Keep the WHEN lists in sync with src/lib/rbac.ts.
-- A role_capability_grants row overrides the code default for that role.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.training_code_allows(_capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    LEFT JOIN public.role_capability_grants g
      ON g.role = ur.role
     AND g.capability = _capability
    WHERE ur.user_id = auth.uid()
      AND COALESCE(g.allowed, CASE _capability
        WHEN 'training.view' THEN ur.role::text = ANY (ARRAY['ceo','coo','cfo','regional_ops','branch_gm','duty_manager','tech_supervisor','hr','auditor'])
        WHEN 'training.learn' THEN ur.role::text = ANY (ARRAY['ceo','coo','cfo','regional_ops','branch_gm','duty_manager','tech_supervisor','technician','cashier_host','auditor','hr','customer_service'])
        WHEN 'training.create' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','branch_gm','hr'])
        WHEN 'training.edit' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','branch_gm','hr'])
        WHEN 'training.publish' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','hr'])
        WHEN 'training.archive' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','hr'])
        WHEN 'training.assign' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','branch_gm','duty_manager','hr'])
        WHEN 'training.assign.department' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','branch_gm','duty_manager','hr'])
        WHEN 'training.assign.site' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','branch_gm','hr'])
        WHEN 'training.assign.company' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','hr'])
        WHEN 'training.assessment.manage' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','branch_gm','hr'])
        WHEN 'training.assessment.grade' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','branch_gm','duty_manager','tech_supervisor','hr'])
        WHEN 'training.session.create' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','branch_gm','duty_manager','tech_supervisor','hr'])
        WHEN 'training.attendance.manage' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','branch_gm','duty_manager','tech_supervisor','hr'])
        WHEN 'training.certificate.view' THEN ur.role::text = ANY (ARRAY['ceo','coo','cfo','regional_ops','branch_gm','duty_manager','hr','auditor'])
        WHEN 'training.certificate.issue' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','branch_gm','hr'])
        WHEN 'training.certificate.revoke' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','hr'])
        WHEN 'training.analytics.view' THEN ur.role::text = ANY (ARRAY['ceo','coo','cfo','regional_ops','branch_gm','hr','auditor'])
        WHEN 'training.reports.export' THEN ur.role::text = ANY (ARRAY['ceo','coo','cfo','regional_ops','branch_gm','hr','auditor'])
        ELSE false
      END)
  );
$$;

CREATE OR REPLACE FUNCTION public.training_actor_staff_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.staff s
  WHERE s.user_id = auth.uid()
    AND s.deleted_at IS NULL
  ORDER BY s.created_at
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.training_can_read_course(_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.training_code_allows('training.view')
    OR EXISTS (
      SELECT 1
      FROM public.training_courses c
      JOIN public.training_course_versions v ON v.id = c.published_version_id
      JOIN public.training_course_enrollments e
        ON e.course_id = c.id
       AND e.version_id = v.id
      JOIN public.staff s ON s.id = e.staff_id
      WHERE c.id = _course_id
        AND c.status = 'PUBLISHED'
        AND v.status = 'PUBLISHED'
        AND s.user_id = auth.uid()
        AND s.deleted_at IS NULL
    );
$$;

CREATE OR REPLACE FUNCTION public.training_can_read_version(_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.training_code_allows('training.view')
    OR EXISTS (
      SELECT 1
      FROM public.training_course_versions v
      JOIN public.training_courses c ON c.id = v.course_id
      JOIN public.training_course_enrollments e
        ON e.version_id = v.id
       AND e.course_id = c.id
      JOIN public.staff s ON s.id = e.staff_id
      WHERE v.id = _version_id
        AND c.status = 'PUBLISHED'
        AND v.status = 'PUBLISHED'
        AND s.user_id = auth.uid()
        AND s.deleted_at IS NULL
    );
$$;

CREATE OR REPLACE FUNCTION public.training_can_read_path(_path_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.training_code_allows('training.view')
    OR EXISTS (
      SELECT 1
      FROM public.training_paths p
      JOIN public.training_path_items i ON i.path_id = p.id
      JOIN public.training_courses c ON c.id = i.course_id
      JOIN public.training_course_versions v ON v.id = c.published_version_id
      JOIN public.training_course_enrollments e
        ON e.course_id = c.id
       AND e.version_id = v.id
      JOIN public.staff s ON s.id = e.staff_id
      WHERE p.id = _path_id
        AND p.status = 'PUBLISHED'
        AND c.status = 'PUBLISHED'
        AND v.status = 'PUBLISHED'
        AND s.user_id = auth.uid()
        AND s.deleted_at IS NULL
    );
$$;

CREATE OR REPLACE FUNCTION public.training_can_read_assignment(_assignment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.training_code_allows('training.view')
    AND (
      EXISTS (
        SELECT 1
        FROM public.training_assignments a
        WHERE a.id = _assignment_id
          AND a.created_by = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.training_assignment_rules r
        WHERE r.assignment_id = _assignment_id
          AND (
            (
              r.target = 'COMPANY'
              AND (
                public.current_user_role_level() >= 80
                OR public.training_code_allows('training.assign.company')
              )
            )
            OR (r.target = 'SITE' AND public.user_can_access_location(r.location_id))
            OR (r.target = 'EMPLOYEE' AND public.user_can_access_staff(r.staff_id))
            OR (r.target NOT IN ('COMPANY', 'SITE', 'EMPLOYEE'))
          )
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- Server authority. The flag is transaction-local and is not a client setting
-- that PostgREST exposes. Triggers ignore it unless a definer function sets it.
-- ---------------------------------------------------------------------------

-- True only when a definer/owner set the flag. PostgREST runs as authenticated
-- (session role authenticator), so a client set_config does not count.
CREATE OR REPLACE FUNCTION public.training_authoritative()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT current_setting('training.authoritative_write', true) = '1'
    AND current_user IN ('postgres', 'supabase_admin', 'service_role');
$$;

CREATE OR REPLACE FUNCTION public.training_tg_course_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.training_authoritative() THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'PUBLISHED' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'PUBLISHED') THEN
    IF NOT public.training_code_allows('training.publish') THEN
      RAISE EXCEPTION 'training.publish required';
    END IF;
  END IF;
  IF NEW.status = 'ARCHIVED' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'ARCHIVED') THEN
    IF NOT public.training_code_allows('training.archive') THEN
      RAISE EXCEPTION 'training.archive required';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.training_tg_enrollment_authority()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.training_course_versions v
    WHERE v.id = NEW.version_id
      AND v.course_id = NEW.course_id
  ) THEN
    RAISE EXCEPTION 'version does not belong to course';
  END IF;
  IF public.training_authoritative() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'COMPLETED' OR NEW.completed_at IS NOT NULL OR NEW.score IS NOT NULL THEN
      RAISE EXCEPTION 'completion and scores are server-authoritative';
    END IF;
  ELSIF (
    (NEW.status = 'COMPLETED' AND OLD.status IS DISTINCT FROM 'COMPLETED')
    OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
    OR NEW.score IS DISTINCT FROM OLD.score
  ) THEN
    RAISE EXCEPTION 'completion and scores are server-authoritative';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.training_tg_progress_authority()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.training_authoritative() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'lesson completion is server-authoritative';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION 'lesson completion is server-authoritative';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.training_tg_attempt_authority()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.training_authoritative() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND (NEW.score IS NOT NULL OR NEW.passed IS NOT NULL) THEN
    RAISE EXCEPTION 'attempt scores are server-authoritative';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.score IS DISTINCT FROM OLD.score
    OR NEW.passed IS DISTINCT FROM OLD.passed
  ) THEN
    RAISE EXCEPTION 'attempt scores are server-authoritative';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.training_tg_practical_authority()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.training_authoritative() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND (NEW.score IS NOT NULL OR NEW.passed IS NOT NULL) THEN
    RAISE EXCEPTION 'practical scores are server-authoritative';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.score IS DISTINCT FROM OLD.score
    OR NEW.passed IS DISTINCT FROM OLD.passed
  ) THEN
    RAISE EXCEPTION 'practical scores are server-authoritative';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.training_tg_certificate_authority()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'certificates are never deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.public_token IS DISTINCT FROM OLD.public_token THEN
    RAISE EXCEPTION 'public verification token is immutable';
  END IF;
  IF NOT public.training_authoritative() THEN
    RAISE EXCEPTION 'certificates are server-authoritative';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.training_tg_competency_authority()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'competencies are not deleted';
  END IF;
  IF NOT public.training_authoritative() THEN
    RAISE EXCEPTION 'competencies are server-authoritative';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.training_tg_audit_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'training audit logs are append-only';
END;
$$;

CREATE TRIGGER trg_training_courses_status
  BEFORE INSERT OR UPDATE ON public.training_courses
  FOR EACH ROW EXECUTE FUNCTION public.training_tg_course_status();

CREATE TRIGGER trg_training_versions_status
  BEFORE INSERT OR UPDATE ON public.training_course_versions
  FOR EACH ROW EXECUTE FUNCTION public.training_tg_course_status();

CREATE TRIGGER trg_training_courses_updated
  BEFORE UPDATE ON public.training_courses
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER trg_training_versions_updated
  BEFORE UPDATE ON public.training_course_versions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER trg_training_paths_status
  BEFORE INSERT OR UPDATE ON public.training_paths
  FOR EACH ROW EXECUTE FUNCTION public.training_tg_course_status();

CREATE TRIGGER trg_training_paths_updated
  BEFORE UPDATE ON public.training_paths
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER trg_training_sessions_updated
  BEFORE UPDATE ON public.training_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER trg_training_progress_updated
  BEFORE UPDATE ON public.training_progress
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER trg_training_enrollment_authority
  BEFORE INSERT OR UPDATE ON public.training_course_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.training_tg_enrollment_authority();

CREATE TRIGGER trg_training_progress_authority
  BEFORE INSERT OR UPDATE ON public.training_progress
  FOR EACH ROW EXECUTE FUNCTION public.training_tg_progress_authority();

CREATE TRIGGER trg_training_attempt_authority
  BEFORE INSERT OR UPDATE ON public.training_attempts
  FOR EACH ROW EXECUTE FUNCTION public.training_tg_attempt_authority();

CREATE TRIGGER trg_training_practical_authority
  BEFORE INSERT OR UPDATE ON public.training_practical_assessments
  FOR EACH ROW EXECUTE FUNCTION public.training_tg_practical_authority();

CREATE TRIGGER trg_training_certificate_authority
  BEFORE INSERT OR UPDATE OR DELETE ON public.training_certificates
  FOR EACH ROW EXECUTE FUNCTION public.training_tg_certificate_authority();

CREATE TRIGGER trg_training_competency_authority
  BEFORE INSERT OR UPDATE OR DELETE ON public.training_competencies
  FOR EACH ROW EXECUTE FUNCTION public.training_tg_competency_authority();

CREATE TRIGGER trg_training_audit_append_only
  BEFORE UPDATE OR DELETE ON public.training_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.training_tg_audit_append_only();

-- ---------------------------------------------------------------------------
-- RPCs. Completion and certificate writes are refused in this phase.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.training_write_audit(
  _action text,
  _table_name text,
  _row_id uuid DEFAULT NULL,
  _location_id uuid DEFAULT NULL,
  _before jsonb DEFAULT NULL,
  _after jsonb DEFAULT NULL,
  _reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  INSERT INTO public.training_audit_logs (
    actor_id, action, table_name, row_id, location_id, before, after, reason
  ) VALUES (
    auth.uid(), _action, _table_name, _row_id, _location_id, _before, _after, _reason
  )
  RETURNING id INTO _id;
  PERFORM public.log_audit(_action, _table_name, _row_id, _location_id, _before, _after, _reason, '{}'::jsonb);
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.training_apply_completion(
  _enrollment_id uuid,
  _client_completed boolean DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _client_completed IS TRUE THEN
    RAISE EXCEPTION 'completion cannot be granted from a client flag';
  END IF;
  RAISE EXCEPTION 'completion evaluation is not implemented';
END;
$$;

CREATE OR REPLACE FUNCTION public.training_issue_certificate(_enrollment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.training_code_allows('training.certificate.issue') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RAISE EXCEPTION 'certificate issuance is not implemented';
END;
$$;

CREATE OR REPLACE FUNCTION public.training_revoke_certificate(_certificate_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.training_code_allows('training.certificate.revoke') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'revocation requires a reason';
  END IF;
  RAISE EXCEPTION 'certificate revocation is not implemented';
END;
$$;

-- Public payload is status, holder name, course title, issued, valid until.
-- EXPIRING is computed. REVOKED stays revoked. No staff id or HR fields.
CREATE OR REPLACE FUNCTION public.training_verify_certificate(_token text)
RETURNS TABLE (
  status text,
  holder_name text,
  course_title text,
  issued_at timestamptz,
  valid_until date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN c.status = 'REVOKED' THEN 'REVOKED'
      WHEN c.valid_until IS NOT NULL AND c.valid_until < (timezone('utc', now()))::date THEN 'EXPIRED'
      WHEN c.status = 'VALID'
        AND c.valid_until IS NOT NULL
        AND c.valid_until <= ((timezone('utc', now()))::date + 30) THEN 'EXPIRING'
      ELSE c.status
    END,
    c.holder_name,
    c.course_title,
    c.issued_at,
    c.valid_until
  FROM public.training_certificates c
  WHERE c.public_token = _token
    AND _token IS NOT NULL
    AND char_length(_token) >= 32;
$$;

REVOKE ALL ON FUNCTION public.training_code_allows(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.training_actor_staff_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.training_can_read_course(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.training_can_read_version(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.training_can_read_path(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.training_can_read_assignment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.training_authoritative() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.training_authoritative() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.training_tg_course_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_tg_enrollment_authority() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_tg_progress_authority() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_tg_attempt_authority() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_tg_practical_authority() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_tg_certificate_authority() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_tg_competency_authority() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_tg_audit_append_only() FROM PUBLIC, anon, authenticated;

-- Trigger functions cannot be called as RPCs. EXECUTE lets an authenticated
-- write fire the trigger instead of failing a permission check.
GRANT EXECUTE ON FUNCTION public.training_tg_course_status() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_tg_enrollment_authority() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_tg_progress_authority() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_tg_attempt_authority() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_tg_practical_authority() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_tg_certificate_authority() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_tg_competency_authority() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_tg_audit_append_only() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.training_write_audit(text, text, uuid, uuid, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_apply_completion(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.training_issue_certificate(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.training_revoke_certificate(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.training_verify_certificate(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.training_code_allows(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_actor_staff_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_can_read_course(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_can_read_version(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_can_read_path(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_can_read_assignment(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_apply_completion(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_issue_certificate(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_revoke_certificate(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_verify_certificate(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_write_audit(text, text, uuid, uuid, jsonb, jsonb, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Privileges. No blanket authenticated DML. Authoritative tables are SELECT only.
-- ---------------------------------------------------------------------------

REVOKE ALL ON
  public.training_courses,
  public.training_course_versions,
  public.training_sections,
  public.training_lessons,
  public.training_paths,
  public.training_path_items,
  public.training_assignments,
  public.training_assignment_rules,
  public.training_course_enrollments,
  public.training_progress,
  public.training_questions,
  public.training_question_keys,
  public.training_attempts,
  public.training_sessions,
  public.training_attendance,
  public.training_practical_assessments,
  public.training_certificates,
  public.training_competencies,
  public.training_entity_links,
  public.training_feedback,
  public.training_audit_logs
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON
  public.training_courses,
  public.training_course_versions,
  public.training_sections,
  public.training_lessons,
  public.training_paths,
  public.training_path_items,
  public.training_questions,
  public.training_sessions,
  public.training_entity_links
TO authenticated;

GRANT SELECT, INSERT ON
  public.training_assignments,
  public.training_assignment_rules,
  public.training_attendance,
  public.training_feedback
TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.training_question_keys TO authenticated;

GRANT SELECT ON
  public.training_course_enrollments,
  public.training_progress,
  public.training_attempts,
  public.training_practical_assessments,
  public.training_certificates,
  public.training_competencies,
  public.training_audit_logs
TO authenticated;

GRANT ALL ON
  public.training_courses,
  public.training_course_versions,
  public.training_sections,
  public.training_lessons,
  public.training_paths,
  public.training_path_items,
  public.training_assignments,
  public.training_assignment_rules,
  public.training_course_enrollments,
  public.training_progress,
  public.training_questions,
  public.training_question_keys,
  public.training_attempts,
  public.training_sessions,
  public.training_attendance,
  public.training_practical_assessments,
  public.training_certificates,
  public.training_competencies,
  public.training_entity_links,
  public.training_feedback,
  public.training_audit_logs
TO service_role;

ALTER TABLE public.training_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_course_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_path_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_assignment_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_course_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_question_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_practical_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_entity_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY training_courses_select ON public.training_courses
  FOR SELECT TO authenticated
  USING (public.training_can_read_course(id));

CREATE POLICY training_courses_insert ON public.training_courses
  FOR INSERT TO authenticated
  WITH CHECK (public.training_code_allows('training.create') AND created_by = auth.uid());

CREATE POLICY training_courses_update ON public.training_courses
  FOR UPDATE TO authenticated
  USING (public.training_code_allows('training.edit'))
  WITH CHECK (public.training_code_allows('training.edit'));

CREATE POLICY training_versions_select ON public.training_course_versions
  FOR SELECT TO authenticated
  USING (public.training_can_read_version(id));

CREATE POLICY training_versions_insert ON public.training_course_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.training_code_allows('training.edit')
    AND public.training_can_read_course(course_id)
  );

CREATE POLICY training_versions_update ON public.training_course_versions
  FOR UPDATE TO authenticated
  USING (public.training_code_allows('training.edit'))
  WITH CHECK (public.training_code_allows('training.edit'));

CREATE POLICY training_sections_select ON public.training_sections
  FOR SELECT TO authenticated
  USING (public.training_can_read_version(version_id));

CREATE POLICY training_sections_write ON public.training_sections
  FOR INSERT TO authenticated
  WITH CHECK (
    public.training_code_allows('training.edit')
    AND public.training_can_read_version(version_id)
  );

CREATE POLICY training_sections_update ON public.training_sections
  FOR UPDATE TO authenticated
  USING (public.training_code_allows('training.edit') AND public.training_can_read_version(version_id))
  WITH CHECK (public.training_code_allows('training.edit') AND public.training_can_read_version(version_id));

CREATE POLICY training_lessons_select ON public.training_lessons
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.training_sections s
      WHERE s.id = training_lessons.section_id
        AND public.training_can_read_version(s.version_id)
    )
  );

CREATE POLICY training_lessons_insert ON public.training_lessons
  FOR INSERT TO authenticated
  WITH CHECK (
    public.training_code_allows('training.edit')
    AND EXISTS (
      SELECT 1
      FROM public.training_sections s
      WHERE s.id = section_id
        AND public.training_can_read_version(s.version_id)
    )
  );

CREATE POLICY training_lessons_update ON public.training_lessons
  FOR UPDATE TO authenticated
  USING (public.training_code_allows('training.edit'))
  WITH CHECK (public.training_code_allows('training.edit'));

CREATE POLICY training_paths_select ON public.training_paths
  FOR SELECT TO authenticated
  USING (public.training_can_read_path(id));

CREATE POLICY training_paths_insert ON public.training_paths
  FOR INSERT TO authenticated
  WITH CHECK (public.training_code_allows('training.create') AND created_by = auth.uid());

CREATE POLICY training_paths_update ON public.training_paths
  FOR UPDATE TO authenticated
  USING (public.training_code_allows('training.edit'))
  WITH CHECK (public.training_code_allows('training.edit'));

CREATE POLICY training_path_items_select ON public.training_path_items
  FOR SELECT TO authenticated
  USING (public.training_can_read_path(path_id));

CREATE POLICY training_path_items_insert ON public.training_path_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.training_code_allows('training.edit')
    AND public.training_can_read_path(path_id)
  );

CREATE POLICY training_assignments_select ON public.training_assignments
  FOR SELECT TO authenticated
  USING (public.training_can_read_assignment(id));

CREATE POLICY training_assignments_insert ON public.training_assignments
  FOR INSERT TO authenticated
  WITH CHECK (public.training_code_allows('training.assign') AND created_by = auth.uid());

CREATE POLICY training_assignment_rules_select ON public.training_assignment_rules
  FOR SELECT TO authenticated
  USING (
    public.training_code_allows('training.view')
    AND (
      target <> 'COMPANY'
      OR public.current_user_role_level() >= 80
      OR public.training_code_allows('training.assign.company')
    )
    AND (location_id IS NULL OR public.user_can_access_location(location_id))
    AND (staff_id IS NULL OR public.user_can_access_staff(staff_id))
  );

CREATE POLICY training_assignment_rules_insert ON public.training_assignment_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      target = 'COMPANY'
      AND public.training_code_allows('training.assign.company')
    )
    OR (
      target = 'SITE'
      AND public.training_code_allows('training.assign.site')
      AND public.user_can_access_location(location_id)
    )
    OR (
      target = 'DEPARTMENT'
      AND public.training_code_allows('training.assign.department')
    )
    OR (
      target NOT IN ('COMPANY', 'SITE', 'DEPARTMENT')
      AND public.training_code_allows('training.assign')
      AND (staff_id IS NULL OR public.user_can_access_staff(staff_id))
      AND (location_id IS NULL OR public.user_can_access_location(location_id))
    )
  );

CREATE POLICY training_enrollments_select ON public.training_course_enrollments
  FOR SELECT TO authenticated
  USING (
    staff_id = public.training_actor_staff_id()
    OR (
      public.training_code_allows('training.view')
      AND public.user_can_access_staff(staff_id)
    )
  );

CREATE POLICY training_progress_select ON public.training_progress
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.training_course_enrollments e
      WHERE e.id = training_progress.enrollment_id
        AND (
          e.staff_id = public.training_actor_staff_id()
          OR (
            public.training_code_allows('training.view')
            AND public.user_can_access_staff(e.staff_id)
          )
        )
    )
  );

CREATE POLICY training_questions_select ON public.training_questions
  FOR SELECT TO authenticated
  USING (public.training_can_read_version(version_id));

CREATE POLICY training_questions_insert ON public.training_questions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.training_code_allows('training.assessment.manage')
    AND public.training_can_read_version(version_id)
  );

CREATE POLICY training_questions_update ON public.training_questions
  FOR UPDATE TO authenticated
  USING (public.training_code_allows('training.assessment.manage'))
  WITH CHECK (public.training_code_allows('training.assessment.manage'));

CREATE POLICY training_question_keys_select ON public.training_question_keys
  FOR SELECT TO authenticated
  USING (public.training_code_allows('training.assessment.manage'));

CREATE POLICY training_question_keys_write ON public.training_question_keys
  FOR INSERT TO authenticated
  WITH CHECK (public.training_code_allows('training.assessment.manage'));

CREATE POLICY training_question_keys_update ON public.training_question_keys
  FOR UPDATE TO authenticated
  USING (public.training_code_allows('training.assessment.manage'))
  WITH CHECK (public.training_code_allows('training.assessment.manage'));

CREATE POLICY training_attempts_select ON public.training_attempts
  FOR SELECT TO authenticated
  USING (
    staff_id = public.training_actor_staff_id()
    OR (
      public.training_code_allows('training.view')
      AND public.user_can_access_staff(staff_id)
    )
  );

CREATE POLICY training_sessions_select ON public.training_sessions
  FOR SELECT TO authenticated
  USING (
    (
      public.training_code_allows('training.view')
      AND public.user_can_access_location(location_id)
    )
    OR (
      public.training_can_read_version(version_id)
      AND EXISTS (
        SELECT 1
        FROM public.staff s
        WHERE s.id = public.training_actor_staff_id()
          AND s.location_id = training_sessions.location_id
          AND s.deleted_at IS NULL
      )
    )
  );

CREATE POLICY training_sessions_insert ON public.training_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.training_code_allows('training.session.create')
    AND public.user_can_access_location(location_id)
    AND created_by = auth.uid()
  );

CREATE POLICY training_sessions_update ON public.training_sessions
  FOR UPDATE TO authenticated
  USING (
    public.training_code_allows('training.session.create')
    AND public.user_can_access_location(location_id)
  )
  WITH CHECK (
    public.training_code_allows('training.session.create')
    AND public.user_can_access_location(location_id)
  );

CREATE POLICY training_attendance_select ON public.training_attendance
  FOR SELECT TO authenticated
  USING (
    staff_id = public.training_actor_staff_id()
    OR (
      public.training_code_allows('training.attendance.manage')
      AND public.user_can_access_staff(staff_id)
    )
  );

CREATE POLICY training_attendance_insert ON public.training_attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    public.training_code_allows('training.attendance.manage')
    AND public.user_can_access_staff(staff_id)
    AND marked_by = auth.uid()
  );

CREATE POLICY training_practical_select ON public.training_practical_assessments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.training_course_enrollments e
      WHERE e.id = training_practical_assessments.enrollment_id
        AND (
          e.staff_id = public.training_actor_staff_id()
          OR (
            public.training_code_allows('training.assessment.grade')
            AND public.user_can_access_staff(e.staff_id)
          )
        )
    )
  );

CREATE POLICY training_certificates_select ON public.training_certificates
  FOR SELECT TO authenticated
  USING (
    staff_id = public.training_actor_staff_id()
    OR (
      public.training_code_allows('training.certificate.view')
      AND public.user_can_access_staff(staff_id)
    )
  );

CREATE POLICY training_competencies_select ON public.training_competencies
  FOR SELECT TO authenticated
  USING (
    staff_id = public.training_actor_staff_id()
    OR (
      public.training_code_allows('training.view')
      AND public.user_can_access_staff(staff_id)
    )
  );

CREATE POLICY training_entity_links_select ON public.training_entity_links
  FOR SELECT TO authenticated
  USING (
    (course_id IS NOT NULL AND public.training_can_read_course(course_id))
    OR (
      enrollment_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.training_course_enrollments e
        WHERE e.id = training_entity_links.enrollment_id
          AND public.training_can_read_course(e.course_id)
      )
    )
  );

CREATE POLICY training_entity_links_insert ON public.training_entity_links
  FOR INSERT TO authenticated
  WITH CHECK (public.training_code_allows('training.edit') AND created_by = auth.uid());

CREATE POLICY training_feedback_select ON public.training_feedback
  FOR SELECT TO authenticated
  USING (
    staff_id = public.training_actor_staff_id()
    OR (
      public.training_code_allows('training.view')
      AND public.user_can_access_staff(staff_id)
    )
  );

CREATE POLICY training_feedback_insert ON public.training_feedback
  FOR INSERT TO authenticated
  WITH CHECK (
    staff_id = public.training_actor_staff_id()
    AND EXISTS (
      SELECT 1
      FROM public.training_course_enrollments e
      WHERE e.id = enrollment_id
        AND e.staff_id = training_feedback.staff_id
    )
  );

CREATE POLICY training_audit_select ON public.training_audit_logs
  FOR SELECT TO authenticated
  USING (
    public.training_code_allows('training.view')
    AND (
      (location_id IS NOT NULL AND public.user_can_access_location(location_id))
      OR (location_id IS NULL AND public.current_user_role_level() >= 80)
    )
  );

-- Private materials. No SELECT policy: signed URLs are a later phase.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'training-materials',
  'training-materials',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4'
  ]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "training materials insert editors"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'training-materials'
    AND public.training_code_allows('training.edit')
  );
