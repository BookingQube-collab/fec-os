-- Course builder fields and lesson kinds for the training engine.
-- Does not change completion, scores, certificates, or legacy training_enrollments.

ALTER TABLE public.training_courses
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS training_type text,
  ADD COLUMN IF NOT EXISTS difficulty text,
  ADD COLUMN IF NOT EXISTS estimated_minutes integer,
  ADD COLUMN IF NOT EXISTS thumbnail_path text,
  ADD COLUMN IF NOT EXISTS instructor_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.master_departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS business_unit text,
  ADD COLUMN IF NOT EXISTS validity_days integer,
  ADD COLUMN IF NOT EXISTS passing_score numeric,
  ADD COLUMN IF NOT EXISTS max_attempts integer,
  ADD COLUMN IF NOT EXISTS certificate_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS certificate_validity_days integer,
  ADD COLUMN IF NOT EXISTS required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.training_courses
  DROP CONSTRAINT IF EXISTS training_courses_difficulty_chk;
ALTER TABLE public.training_courses
  ADD CONSTRAINT training_courses_difficulty_chk CHECK (
    difficulty IS NULL OR difficulty IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')
  );

ALTER TABLE public.training_courses
  DROP CONSTRAINT IF EXISTS training_courses_type_chk;
ALTER TABLE public.training_courses
  ADD CONSTRAINT training_courses_type_chk CHECK (
    training_type IS NULL OR training_type IN (
      'INDUCTION', 'COMPLIANCE', 'SKILL', 'SAFETY', 'PRODUCT', 'OTHER'
    )
  );

ALTER TABLE public.training_courses
  DROP CONSTRAINT IF EXISTS training_courses_minutes_chk;
ALTER TABLE public.training_courses
  ADD CONSTRAINT training_courses_minutes_chk CHECK (
    estimated_minutes IS NULL OR estimated_minutes >= 0
  );

ALTER TABLE public.training_courses
  DROP CONSTRAINT IF EXISTS training_courses_score_chk;
ALTER TABLE public.training_courses
  ADD CONSTRAINT training_courses_score_chk CHECK (
    passing_score IS NULL OR (passing_score >= 0 AND passing_score <= 100)
  );

ALTER TABLE public.training_courses
  DROP CONSTRAINT IF EXISTS training_courses_attempts_chk;
ALTER TABLE public.training_courses
  ADD CONSTRAINT training_courses_attempts_chk CHECK (
    max_attempts IS NULL OR max_attempts > 0
  );

ALTER TABLE public.training_courses
  DROP CONSTRAINT IF EXISTS training_courses_validity_chk;
ALTER TABLE public.training_courses
  ADD CONSTRAINT training_courses_validity_chk CHECK (
    (validity_days IS NULL OR validity_days > 0)
    AND (certificate_validity_days IS NULL OR certificate_validity_days > 0)
  );

ALTER TABLE public.training_courses
  DROP CONSTRAINT IF EXISTS training_courses_thumbnail_chk;
ALTER TABLE public.training_courses
  ADD CONSTRAINT training_courses_thumbnail_chk CHECK (
    thumbnail_path IS NULL OR thumbnail_path !~* '^https?://'
  );

ALTER TABLE public.training_lessons
  ADD COLUMN IF NOT EXISTS external_url text;

ALTER TABLE public.training_lessons
  DROP CONSTRAINT IF EXISTS training_lessons_kind_chk;
ALTER TABLE public.training_lessons
  ADD CONSTRAINT training_lessons_kind_chk CHECK (
    kind IN (
      'TEXT', 'RICH_TEXT', 'VIDEO', 'IMAGE', 'PDF', 'DOCUMENT', 'PRESENTATION',
      'AUDIO', 'EXTERNAL_LINK', 'CHECKLIST', 'ACKNOWLEDGEMENT', 'QUIZ',
      'ASSESSMENT', 'ASSIGNMENT', 'PRACTICAL_ASSESSMENT'
    )
  );

ALTER TABLE public.training_lessons
  DROP CONSTRAINT IF EXISTS training_lessons_external_url_chk;
ALTER TABLE public.training_lessons
  ADD CONSTRAINT training_lessons_external_url_chk CHECK (
    external_url IS NULL OR external_url ~* '^https://'
  );

COMMENT ON COLUMN public.training_lessons.external_url IS
  'HTTPS link for EXTERNAL_LINK lessons. storage_path remains a private bucket path.';

CREATE TABLE IF NOT EXISTS public.training_course_prerequisites (
  course_id uuid NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
  prerequisite_course_id uuid NOT NULL REFERENCES public.training_courses(id) ON DELETE RESTRICT,
  PRIMARY KEY (course_id, prerequisite_course_id),
  CONSTRAINT training_course_prerequisites_self_chk CHECK (course_id <> prerequisite_course_id)
);

REVOKE ALL ON public.training_course_prerequisites FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.training_course_prerequisites TO authenticated;
GRANT ALL ON public.training_course_prerequisites TO service_role;

ALTER TABLE public.training_course_prerequisites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_prereq_select ON public.training_course_prerequisites;
CREATE POLICY training_prereq_select ON public.training_course_prerequisites
  FOR SELECT TO authenticated
  USING (public.training_can_read_course(course_id));

DROP POLICY IF EXISTS training_prereq_insert ON public.training_course_prerequisites;
CREATE POLICY training_prereq_insert ON public.training_course_prerequisites
  FOR INSERT TO authenticated
  WITH CHECK (
    public.training_code_allows('training.edit')
    AND public.training_can_read_course(course_id)
    AND public.training_can_read_course(prerequisite_course_id)
  );

DROP POLICY IF EXISTS training_prereq_delete ON public.training_course_prerequisites;
CREATE POLICY training_prereq_delete ON public.training_course_prerequisites
  FOR DELETE TO authenticated
  USING (
    public.training_code_allows('training.edit')
    AND public.training_can_read_course(course_id)
  );

GRANT DELETE ON public.training_sections, public.training_lessons TO authenticated;

DROP POLICY IF EXISTS training_sections_delete ON public.training_sections;
CREATE POLICY training_sections_delete ON public.training_sections
  FOR DELETE TO authenticated
  USING (
    public.training_code_allows('training.edit')
    AND public.training_can_read_version(version_id)
  );

DROP POLICY IF EXISTS training_lessons_delete ON public.training_lessons;
CREATE POLICY training_lessons_delete ON public.training_lessons
  FOR DELETE TO authenticated
  USING (
    public.training_code_allows('training.edit')
    AND EXISTS (
      SELECT 1
      FROM public.training_sections s
      WHERE s.id = training_lessons.section_id
        AND public.training_can_read_version(s.version_id)
    )
  );

-- Published and archived versions stay locked unless a definer sets the authority flag.
CREATE OR REPLACE FUNCTION public.training_tg_content_draft_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _version_id uuid;
  _status text;
BEGIN
  IF public.training_authoritative() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'training_sections' THEN
    _version_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.version_id ELSE NEW.version_id END;
  ELSE
    SELECT s.version_id INTO _version_id
    FROM public.training_sections s
    WHERE s.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.section_id ELSE NEW.section_id END;
  END IF;

  SELECT v.status INTO _status
  FROM public.training_course_versions v
  WHERE v.id = _version_id;

  IF _status IS NULL OR _status IN ('PUBLISHED', 'ARCHIVED') THEN
    RAISE EXCEPTION 'published content is locked; create a new draft version';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_training_sections_draft_only ON public.training_sections;
CREATE TRIGGER trg_training_sections_draft_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.training_sections
  FOR EACH ROW EXECUTE FUNCTION public.training_tg_content_draft_only();

DROP TRIGGER IF EXISTS trg_training_lessons_draft_only ON public.training_lessons;
CREATE TRIGGER trg_training_lessons_draft_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.training_lessons
  FOR EACH ROW EXECUTE FUNCTION public.training_tg_content_draft_only();

REVOKE ALL ON FUNCTION public.training_tg_content_draft_only() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.training_tg_content_draft_only() TO authenticated, service_role;

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'audio/mpeg',
  'audio/mp4',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]
WHERE id = 'training-materials';
