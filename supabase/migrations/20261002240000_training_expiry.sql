-- Expiry notices, stored EXPIRED status, and refresher enrollment.
-- EXPIRING stays a computed verification status. Notices are insert-only so a
-- repeated sweep does not send the same threshold again.

ALTER TABLE public.training_courses
  ADD COLUMN IF NOT EXISTS refresher_course_id uuid REFERENCES public.training_courses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retraining_lead_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS competency_code text,
  ADD COLUMN IF NOT EXISTS competency_name text,
  ADD COLUMN IF NOT EXISTS retrain_on_publish boolean NOT NULL DEFAULT false;

ALTER TABLE public.training_courses
  DROP CONSTRAINT IF EXISTS training_courses_refresher_chk;
ALTER TABLE public.training_courses
  ADD CONSTRAINT training_courses_refresher_chk CHECK (
    refresher_course_id IS NULL OR refresher_course_id <> id
  );

ALTER TABLE public.training_courses
  DROP CONSTRAINT IF EXISTS training_courses_retrain_lead_chk;
ALTER TABLE public.training_courses
  ADD CONSTRAINT training_courses_retrain_lead_chk CHECK (
    retraining_lead_days BETWEEN 1 AND 365
  );

ALTER TABLE public.training_courses
  DROP CONSTRAINT IF EXISTS training_courses_competency_code_chk;
ALTER TABLE public.training_courses
  ADD CONSTRAINT training_courses_competency_code_chk CHECK (
    competency_code IS NULL OR competency_code ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$'
  );

ALTER TABLE public.training_competencies
  ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT 'COMPETENT';

ALTER TABLE public.training_competencies
  DROP CONSTRAINT IF EXISTS training_competencies_level_chk;
ALTER TABLE public.training_competencies
  ADD CONSTRAINT training_competencies_level_chk CHECK (
    level IN (
      'NOT_TRAINED',
      'TRAINING_IN_PROGRESS',
      'TRAINED',
      'ASSESSMENT_PENDING',
      'COMPETENT',
      'EXPIRED',
      'REQUIRES_RETRAINING'
    )
  );

CREATE TABLE IF NOT EXISTS public.training_certificate_notices (
  certificate_id uuid NOT NULL REFERENCES public.training_certificates(id) ON DELETE CASCADE,
  notice text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (certificate_id, notice),
  CONSTRAINT training_certificate_notices_kind_chk CHECK (
    notice IN ('D30', 'D14', 'D7', 'EXPIRED', 'RETRAIN')
  )
);

ALTER TABLE public.training_certificate_notices ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.training_certificate_notices FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.training_certificate_notices TO authenticated;
GRANT ALL ON public.training_certificate_notices TO service_role;

DROP POLICY IF EXISTS training_certificate_notices_select ON public.training_certificate_notices;
CREATE POLICY training_certificate_notices_select ON public.training_certificate_notices
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.training_certificates c
      WHERE c.id = training_certificate_notices.certificate_id
        AND (
          c.staff_id = public.training_actor_staff_id()
          OR (
            public.training_code_allows('training.certificate.view')
            AND public.user_can_access_staff(c.staff_id)
          )
        )
    )
  );

CREATE INDEX IF NOT EXISTS training_certificates_open_expiry_idx
  ON public.training_certificates (valid_until)
  WHERE status = 'VALID';

-- Award the course competency when a certificate is materialized.
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
  _competency_code text;
  _competency_name text;
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
    s.full_name, s.user_id, NULLIF(btrim(ins.full_name), ''),
    NULLIF(btrim(c.competency_code), ''), NULLIF(btrim(c.competency_name), '')
  INTO
    _enrollment, _staff, _course, _completed, _status,
    _enabled, _days, _code, _title, _location,
    _name, _user, _signatory,
    _competency_code, _competency_name
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

  IF _competency_code IS NOT NULL THEN
    INSERT INTO public.training_competencies (
      staff_id, code, name, enrollment_id, expires_on, level
    ) VALUES (
      _staff,
      _competency_code,
      COALESCE(_competency_name, _competency_code),
      _enrollment,
      _until,
      'COMPETENT'
    )
    ON CONFLICT (staff_id, code, enrollment_id) DO NOTHING;
  END IF;

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
  _enrollment uuid;
  _trimmed text := btrim(COALESCE(_reason, ''));
BEGIN
  IF NOT public.training_code_allows('training.certificate.revoke') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _trimmed = '' THEN
    RAISE EXCEPTION 'revocation requires a reason';
  END IF;

  SELECT c.staff_id, c.status, c.course_title, c.enrollment_id, course.location_id, s.user_id
    INTO _staff, _status, _title, _enrollment, _location, _user
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

  IF _enrollment IS NOT NULL THEN
    UPDATE public.training_competencies
    SET level = 'REQUIRES_RETRAINING'
    WHERE enrollment_id = _enrollment
      AND level IS DISTINCT FROM 'REQUIRES_RETRAINING';
  END IF;

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

CREATE OR REPLACE FUNCTION public.training_enroll_refresher(_certificate_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _staff uuid;
  _refresher uuid;
  _version uuid;
  _due date;
BEGIN
  IF NOT public.training_authoritative() THEN
    RAISE EXCEPTION 'certificates are server-authoritative';
  END IF;

  SELECT c.staff_id, course.refresher_course_id, c.valid_until
    INTO _staff, _refresher, _due
  FROM public.training_certificates c
  JOIN public.training_courses course ON course.id = c.course_id
  WHERE c.id = _certificate_id;

  IF _staff IS NULL OR _refresher IS NULL THEN
    RETURN false;
  END IF;

  SELECT c.published_version_id INTO _version
  FROM public.training_courses c
  WHERE c.id = _refresher
    AND c.status = 'PUBLISHED'
    AND c.published_version_id IS NOT NULL;

  IF _version IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.training_course_enrollments (
    staff_id, course_id, version_id, status, due_on, required
  )
  SELECT _staff, _refresher, _version, 'ENROLLED', COALESCE(_due, (timezone('utc', now()))::date), true
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.training_course_enrollments e
    WHERE e.staff_id = _staff
      AND e.course_id = _refresher
      AND e.completed_at IS NULL
      AND e.status IN ('ENROLLED', 'IN_PROGRESS')
  )
  ON CONFLICT (staff_id, version_id) DO NOTHING;

  RETURN FOUND;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.training_apply_expiry()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _today date := (timezone('utc', now()))::date;
  _cert record;
  _days integer;
  _bucket text;
  _notices integer := 0;
  _expired integer := 0;
  _retrained integer := 0;
  _manager uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.training_code_allows('training.certificate.issue') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  PERFORM set_config('training.authoritative_write', '1', true);

  FOR _cert IN
    SELECT
      c.id,
      c.staff_id,
      c.status,
      c.valid_until,
      c.course_title,
      course.location_id,
      course.retraining_lead_days,
      s.user_id,
      s.reporting_manager_staff_id
    FROM public.training_certificates c
    JOIN public.training_courses course ON course.id = c.course_id
    JOIN public.staff s ON s.id = c.staff_id
    WHERE c.status = 'VALID'
      AND c.valid_until IS NOT NULL
      AND c.valid_until <= _today + 30
  LOOP
    _days := _cert.valid_until - _today;
    _bucket := CASE
      WHEN _days < 0 THEN 'EXPIRED'
      WHEN _days <= 7 THEN 'D7'
      WHEN _days <= 14 THEN 'D14'
      ELSE 'D30'
    END;

    IF _days < 0 THEN
      UPDATE public.training_certificates
      SET status = 'EXPIRED'
      WHERE id = _cert.id
        AND status = 'VALID';
      IF FOUND THEN
        _expired := _expired + 1;
        UPDATE public.training_competencies
        SET level = 'EXPIRED'
        WHERE enrollment_id = (
          SELECT enrollment_id FROM public.training_certificates WHERE id = _cert.id
        )
          AND level IN ('COMPETENT', 'TRAINED');
      END IF;
    END IF;

    INSERT INTO public.training_certificate_notices (certificate_id, notice)
    VALUES (_cert.id, _bucket)
    ON CONFLICT DO NOTHING;
    IF FOUND THEN
      _notices := _notices + 1;
      IF _cert.user_id IS NOT NULL THEN
        INSERT INTO public.notifications (
          user_id, location_id, category, title, body, severity, source_type, source_id, action_url
        ) VALUES (
          _cert.user_id,
          _cert.location_id,
          'training',
          CASE WHEN _bucket = 'EXPIRED' THEN 'Certificate expired' ELSE 'Certificate expiring' END,
          _cert.course_title,
          CASE WHEN _bucket = 'EXPIRED' THEN 'warning' ELSE 'info' END,
          'training_certificate',
          _cert.id,
          '/training/certificates'
        );
      END IF;
      SELECT manager.user_id INTO _manager
      FROM public.staff manager
      WHERE manager.id = _cert.reporting_manager_staff_id
        AND manager.deleted_at IS NULL
        AND manager.user_id IS NOT NULL
        AND manager.user_id IS DISTINCT FROM _cert.user_id;
      IF _manager IS NOT NULL THEN
        INSERT INTO public.notifications (
          user_id, location_id, category, title, body, severity, source_type, source_id, action_url
        ) VALUES (
          _manager,
          _cert.location_id,
          'training',
          CASE WHEN _bucket = 'EXPIRED' THEN 'Team certificate expired' ELSE 'Team certificate expiring' END,
          _cert.course_title,
          'info',
          'training_certificate',
          _cert.id,
          '/training/certificates'
        );
      END IF;
    END IF;

    IF _days <= _cert.retraining_lead_days THEN
      INSERT INTO public.training_certificate_notices (certificate_id, notice)
      VALUES (_cert.id, 'RETRAIN')
      ON CONFLICT DO NOTHING;
      IF FOUND AND public.training_enroll_refresher(_cert.id) THEN
        _retrained := _retrained + 1;
        IF _cert.user_id IS NOT NULL THEN
          INSERT INTO public.notifications (
            user_id, location_id, category, title, body, severity, source_type, source_id, action_url
          ) VALUES (
            _cert.user_id, _cert.location_id, 'training', 'Retraining assigned',
            _cert.course_title, 'info', 'training_certificate', _cert.id, '/training/learning'
          );
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('expired', _expired, 'notices', _notices, 'retraining', _retrained);
END;
$fn$;

COMMENT ON FUNCTION public.training_apply_expiry() IS
  'Marks lapsed certificates EXPIRED, notifies the 30/14/7/expired bucket once, and enrolls the published refresher when the lead window is open. Holder name and course title are the only person fields used.';

CREATE OR REPLACE FUNCTION public.training_assign_published_retraining(_course_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _version uuid;
  _version_no integer;
  _allowed boolean;
  _inserted integer := 0;
BEGIN
  IF NOT public.training_code_allows('training.assign') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT c.published_version_id, v.version_no, c.retrain_on_publish
    INTO _version, _version_no, _allowed
  FROM public.training_courses c
  JOIN public.training_course_versions v ON v.id = c.published_version_id
  WHERE c.id = _course_id
    AND c.status = 'PUBLISHED'
    AND v.status = 'PUBLISHED';

  IF _version IS NULL THEN
    RAISE EXCEPTION 'published version not found';
  END IF;
  IF NOT COALESCE(_allowed, false) THEN
    RAISE EXCEPTION 'retraining on publish is off for this course';
  END IF;

  INSERT INTO public.training_course_enrollments (
    staff_id, course_id, version_id, status, due_on, required
  )
  SELECT DISTINCT s.id, _course_id, _version, 'ENROLLED', (timezone('utc', now()))::date + 30, true
  FROM public.training_course_enrollments prior
  JOIN public.training_course_versions old_version ON old_version.id = prior.version_id
  JOIN public.staff s ON s.id = prior.staff_id
  WHERE prior.course_id = _course_id
    AND prior.completed_at IS NOT NULL
    AND old_version.version_no < _version_no
    AND s.deleted_at IS NULL
    AND s.status = 'active'
    AND public.user_can_access_staff(s.id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.training_course_enrollments current_row
      WHERE current_row.staff_id = s.id
        AND current_row.version_id = _version
    )
  ON CONFLICT (staff_id, version_id) DO NOTHING;

  GET DIAGNOSTICS _inserted = ROW_COUNT;
  RETURN _inserted;
END;
$fn$;

COMMENT ON FUNCTION public.training_assign_published_retraining(uuid) IS
  'Enrolls in-scope staff who finished an older version onto the published version. Leaves historical completions in place. Runs only when retrain_on_publish is true.';

REVOKE ALL ON FUNCTION public.training_enroll_refresher(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.training_enroll_refresher(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.training_apply_expiry() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.training_apply_expiry() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.training_assign_published_retraining(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.training_assign_published_retraining(uuid) TO authenticated, service_role;
