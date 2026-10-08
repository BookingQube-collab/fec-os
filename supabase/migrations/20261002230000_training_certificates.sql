-- Certificate issue, revocation, and automatic issue after server-side completion.
-- Public verification stays on training_verify_certificate: status, holder name,
-- course title, issued at, valid until. EXPIRING is computed and is not stored.
-- The public token stays a random 64-hex value. There is no certificate sequence.
-- Rows are never deleted.

ALTER TABLE public.training_certificates
  ADD COLUMN IF NOT EXISTS course_code text,
  ADD COLUMN IF NOT EXISTS score numeric,
  ADD COLUMN IF NOT EXISTS signatory_name text;

ALTER TABLE public.training_certificates
  DROP CONSTRAINT IF EXISTS training_certificates_score_chk;
ALTER TABLE public.training_certificates
  ADD CONSTRAINT training_certificates_score_chk CHECK (
    score IS NULL OR (score >= 0 AND score <= 100)
  );

COMMENT ON COLUMN public.training_certificates.course_code IS
  'Course code snapshot. Not an employee identifier.';

COMMENT ON COLUMN public.training_certificates.score IS
  'Best passed quiz score already stored on the attempt. The client does not send it.';

COMMENT ON COLUMN public.training_certificates.signatory_name IS
  'Instructor display name snapshot. Not an account email or phone.';

-- Quiet insert used by completion and by the authorized issue RPC.
-- Returns null when the course does not issue a certificate, the enrollment
-- is not complete, or the employee name is blank. Does not raise for those skips.
CREATE OR REPLACE FUNCTION public.training_materialize_certificate(_enrollment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _existing uuid;
  _enrollment uuid;
  _staff uuid;
  _course uuid;
  _completed timestamptz;
  _status text;
  _enabled boolean;
  _days integer;
  _code text;
  _title text;
  _location uuid;
  _name text;
  _user uuid;
  _signatory text;
  _score numeric;
  _until date;
  _id uuid;
BEGIN
  IF NOT public.training_authoritative() THEN
    RAISE EXCEPTION 'certificates are server-authoritative';
  END IF;

  SELECT c.id INTO _existing
  FROM public.training_certificates c
  WHERE c.enrollment_id = _enrollment_id;
  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  SELECT
    e.id, e.staff_id, e.course_id, e.completed_at, e.status,
    c.certificate_enabled, c.certificate_validity_days, c.code, c.title, c.location_id,
    s.full_name, s.user_id, NULLIF(btrim(ins.full_name), '')
  INTO
    _enrollment, _staff, _course, _completed, _status,
    _enabled, _days, _code, _title, _location,
    _name, _user, _signatory
  FROM public.training_course_enrollments e
  JOIN public.training_courses c ON c.id = e.course_id
  JOIN public.staff s ON s.id = e.staff_id
  LEFT JOIN public.staff ins ON ins.id = c.instructor_staff_id
  WHERE e.id = _enrollment_id;

  IF _enrollment IS NULL OR _completed IS NULL OR _status IS DISTINCT FROM 'COMPLETED' THEN
    RETURN NULL;
  END IF;
  IF COALESCE(_enabled, false) IS NOT TRUE THEN
    RETURN NULL;
  END IF;
  IF _name IS NULL OR btrim(_name) = '' THEN
    RETURN NULL;
  END IF;

  SELECT max(a.score) INTO _score
  FROM public.training_attempts a
  WHERE a.enrollment_id = _enrollment_id
    AND a.passed IS TRUE
    AND a.submitted_at IS NOT NULL
    AND a.score IS NOT NULL;

  IF _days IS NULL THEN
    _until := NULL;
  ELSE
    _until := (timezone('utc', now()))::date + _days;
  END IF;

  INSERT INTO public.training_certificates (
    enrollment_id, staff_id, course_id, holder_name, course_title, course_code,
    score, signatory_name, status, valid_until
  ) VALUES (
    _enrollment, _staff, _course, btrim(_name), _title, _code,
    _score, _signatory, 'VALID', _until
  )
  RETURNING id INTO _id;

  PERFORM public.training_write_audit(
    'certificate.issued',
    'training_certificates',
    _id,
    _location,
    NULL,
    jsonb_build_object('status', 'VALID', 'course_code', _code),
    NULL
  );

  IF _user IS NOT NULL THEN
    INSERT INTO public.notifications (
      user_id, location_id, category, title, body, severity, source_type, source_id, action_url
    ) VALUES (
      _user, _location, 'training', 'Certificate issued', _title, 'info',
      'training_certificate', _id, '/training/certificates'
    );
  END IF;

  RETURN _id;
END;
$fn$;

COMMENT ON FUNCTION public.training_materialize_certificate(uuid) IS
  'Inserts one certificate from stored enrollment, staff name, and passed attempt score. No client score argument. Null when the course has certificates off or completion is missing.';

DROP FUNCTION IF EXISTS public.training_issue_certificate(uuid);

CREATE FUNCTION public.training_issue_certificate(_enrollment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _staff uuid;
  _completed timestamptz;
  _status text;
  _enabled boolean;
  _name text;
  _id uuid;
BEGIN
  IF NOT public.training_code_allows('training.certificate.issue') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT e.staff_id, e.completed_at, e.status, c.certificate_enabled, s.full_name
    INTO _staff, _completed, _status, _enabled, _name
  FROM public.training_course_enrollments e
  JOIN public.training_courses c ON c.id = e.course_id
  JOIN public.staff s ON s.id = e.staff_id
  WHERE e.id = _enrollment_id;

  IF _staff IS NULL OR NOT public.user_can_access_staff(_staff) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _completed IS NULL OR _status IS DISTINCT FROM 'COMPLETED' THEN
    RAISE EXCEPTION 'enrollment is not complete';
  END IF;
  IF COALESCE(_enabled, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'course does not issue certificates';
  END IF;
  IF _name IS NULL OR btrim(_name) = '' THEN
    RAISE EXCEPTION 'employee name is missing';
  END IF;

  PERFORM set_config('training.authoritative_write', '1', true);
  _id := public.training_materialize_certificate(_enrollment_id);
  IF _id IS NULL THEN
    RAISE EXCEPTION 'certificate was not issued';
  END IF;
  RETURN _id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.training_revoke_certificate(_certificate_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _staff uuid;
  _status text;
  _location uuid;
  _user uuid;
  _title text;
  _trimmed text := btrim(COALESCE(_reason, ''));
BEGIN
  IF NOT public.training_code_allows('training.certificate.revoke') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _trimmed = '' THEN
    RAISE EXCEPTION 'revocation requires a reason';
  END IF;

  SELECT c.staff_id, c.status, c.course_title, course.location_id, s.user_id
    INTO _staff, _status, _title, _location, _user
  FROM public.training_certificates c
  JOIN public.training_courses course ON course.id = c.course_id
  JOIN public.staff s ON s.id = c.staff_id
  WHERE c.id = _certificate_id;

  IF _staff IS NULL OR NOT public.user_can_access_staff(_staff) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _status = 'REVOKED' THEN
    RAISE EXCEPTION 'certificate is already revoked';
  END IF;

  PERFORM set_config('training.authoritative_write', '1', true);
  UPDATE public.training_certificates
  SET status = 'REVOKED',
      revoked_at = now(),
      revoked_by = auth.uid(),
      revoke_reason = _trimmed
  WHERE id = _certificate_id
    AND status <> 'REVOKED';

  PERFORM public.training_write_audit(
    'certificate.revoked',
    'training_certificates',
    _certificate_id,
    _location,
    jsonb_build_object('status', _status),
    jsonb_build_object('status', 'REVOKED'),
    _trimmed
  );

  IF _user IS NOT NULL THEN
    INSERT INTO public.notifications (
      user_id, location_id, category, title, body, severity, source_type, source_id, action_url
    ) VALUES (
      _user, _location, 'training', 'Certificate revoked', _title, 'warning',
      'training_certificate', _certificate_id, '/training/certificates'
    );
  END IF;
END;
$fn$;

-- Same completion gates as 20261002220000. After a real completion, issue a
-- certificate when the course asks for one. A skip does not undo completion.
CREATE OR REPLACE FUNCTION public.training_try_complete_enrollment(_enrollment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _version uuid;
  _lesson_count integer := 0;
  _gated boolean := false;
  _required_open boolean := false;
BEGIN
  SELECT e.version_id INTO _version
  FROM public.training_course_enrollments e
  WHERE e.id = _enrollment_id;
  IF _version IS NULL THEN
    RETURN false;
  END IF;

  SELECT count(*) INTO _lesson_count
  FROM public.training_lessons l
  JOIN public.training_sections s ON s.id = l.section_id
  WHERE s.version_id = _version;

  SELECT
    coalesce(bool_or(l.kind IN ('QUIZ', 'ASSESSMENT', 'ASSIGNMENT', 'PRACTICAL_ASSESSMENT') AND p.completed_at IS NULL), false),
    coalesce(bool_or(l.required AND p.completed_at IS NULL), false)
    INTO _gated, _required_open
  FROM public.training_lessons l
  JOIN public.training_sections s ON s.id = l.section_id
  LEFT JOIN public.training_progress p
    ON p.lesson_id = l.id
   AND p.enrollment_id = _enrollment_id
  WHERE s.version_id = _version;

  IF _lesson_count > 0
    AND NOT _gated
    AND NOT _required_open
    AND NOT public.training_attendance_blocks_completion(_enrollment_id)
  THEN
    PERFORM set_config('training.authoritative_write', '1', true);
    UPDATE public.training_course_enrollments
    SET status = 'COMPLETED',
        completed_at = COALESCE(completed_at, now())
    WHERE id = _enrollment_id
      AND completed_at IS NULL;
    IF FOUND THEN
      PERFORM public.training_materialize_certificate(_enrollment_id);
      RETURN true;
    END IF;
  END IF;
  RETURN false;
END;
$fn$;

COMMENT ON FUNCTION public.training_try_complete_enrollment(uuid) IS
  'Completes an enrollment only when required lessons, open gates, and attendance are done. Issues a certificate only through training_materialize_certificate.';

CREATE OR REPLACE FUNCTION public.training_certificate_queue(_limit integer, _offset integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _limit_n integer := LEAST(GREATEST(COALESCE(_limit, 20), 1), 50);
  _offset_n integer := GREATEST(COALESCE(_offset, 0), 0);
  _rows jsonb;
  _total integer;
BEGIN
  IF NOT public.training_code_allows('training.certificate.issue') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT count(*) INTO _total
  FROM public.training_course_enrollments e
  JOIN public.training_courses c ON c.id = e.course_id
  WHERE e.status = 'COMPLETED'
    AND e.completed_at IS NOT NULL
    AND c.certificate_enabled
    AND public.user_can_access_staff(e.staff_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.training_certificates cert WHERE cert.enrollment_id = e.id
    );

  SELECT COALESCE(jsonb_agg(row_to_json(q)::jsonb), '[]'::jsonb) INTO _rows
  FROM (
    SELECT
      e.id AS "enrollmentId",
      s.full_name AS "holderName",
      s.employee_code AS "employeeCode",
      c.title AS "courseTitle",
      c.code AS "courseCode",
      e.completed_at AS "completedAt"
    FROM public.training_course_enrollments e
    JOIN public.training_courses c ON c.id = e.course_id
    JOIN public.staff s ON s.id = e.staff_id
    WHERE e.status = 'COMPLETED'
      AND e.completed_at IS NOT NULL
      AND c.certificate_enabled
      AND public.user_can_access_staff(e.staff_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.training_certificates cert WHERE cert.enrollment_id = e.id
      )
    ORDER BY e.completed_at DESC
    LIMIT _limit_n OFFSET _offset_n
  ) q;

  RETURN jsonb_build_object('total', _total, 'rows', _rows);
END;
$fn$;

COMMENT ON FUNCTION public.training_certificate_queue(integer, integer) IS
  'Completed enrollments in the caller scope that still have no certificate. Does not return QID, passport, phone, email, or salary.';

REVOKE ALL ON FUNCTION public.training_materialize_certificate(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.training_materialize_certificate(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.training_issue_certificate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.training_issue_certificate(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.training_certificate_queue(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.training_certificate_queue(integer, integer) TO authenticated, service_role;
