-- Training matrix, learning-path certificates, cross-module requirement links, and dashboard counts.
-- Chat hub tables are not written here. A share card is built in the application
-- and still has to pass the course read check.

ALTER TABLE public.training_certificates
  ALTER COLUMN enrollment_id DROP NOT NULL;

ALTER TABLE public.training_certificates
  ADD COLUMN IF NOT EXISTS path_id uuid REFERENCES public.training_paths(id) ON DELETE RESTRICT;

ALTER TABLE public.training_certificates
  DROP CONSTRAINT IF EXISTS training_certificates_subject_chk;
ALTER TABLE public.training_certificates
  ADD CONSTRAINT training_certificates_subject_chk CHECK (
    num_nonnulls(enrollment_id, path_id) = 1
  );

CREATE UNIQUE INDEX IF NOT EXISTS training_certificates_path_staff_uidx
  ON public.training_certificates (path_id, staff_id)
  WHERE path_id IS NOT NULL;

ALTER TABLE public.training_paths
  ADD COLUMN IF NOT EXISTS certificate_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.training_entity_links
  ADD COLUMN IF NOT EXISTS requirement_type text NOT NULL DEFAULT 'REQUIRED',
  ADD COLUMN IF NOT EXISTS enforce_mode text NOT NULL DEFAULT 'WARN';

ALTER TABLE public.training_entity_links
  DROP CONSTRAINT IF EXISTS training_entity_links_type_chk;
ALTER TABLE public.training_entity_links
  ADD CONSTRAINT training_entity_links_type_chk CHECK (
    entity_type IN (
      'SOP', 'ASSET', 'TICKET', 'EVENT', 'MAINTENANCE', 'LOCATION', 'DEPARTMENT',
      'INCIDENT', 'POLICY', 'JOB_ROLE', 'EQUIPMENT', 'PROCESS', 'GAME', 'SAFETY_REQUIREMENT'
    )
  );

ALTER TABLE public.training_entity_links
  DROP CONSTRAINT IF EXISTS training_entity_links_requirement_chk;
ALTER TABLE public.training_entity_links
  ADD CONSTRAINT training_entity_links_requirement_chk CHECK (
    requirement_type IN ('REQUIRED', 'RECOMMENDED')
  );

ALTER TABLE public.training_entity_links
  DROP CONSTRAINT IF EXISTS training_entity_links_enforce_chk;
ALTER TABLE public.training_entity_links
  ADD CONSTRAINT training_entity_links_enforce_chk CHECK (
    enforce_mode IN ('WARN', 'BLOCK')
  );

CREATE OR REPLACE FUNCTION public.training_matrix_cell(
  _enrollment_id uuid,
  _completed_at timestamptz,
  _cert_status text,
  _valid_until date,
  _today date
) RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN _cert_status = 'REVOKED' THEN 'REVOKED'
    WHEN _cert_status = 'EXPIRED'
      OR (_valid_until IS NOT NULL AND _valid_until < _today AND _cert_status IS DISTINCT FROM 'REVOKED')
      THEN 'EXPIRED'
    WHEN _cert_status = 'VALID' AND _valid_until IS NOT NULL AND _valid_until <= _today + 30 THEN 'EXPIRING'
    WHEN _cert_status = 'VALID' THEN 'VALID'
    WHEN _completed_at IS NOT NULL THEN 'TRAINED'
    WHEN _enrollment_id IS NOT NULL THEN 'IN_PROGRESS'
    ELSE 'NOT_TRAINED'
  END;
$fn$;

CREATE OR REPLACE FUNCTION public.training_matrix(
  _location_id uuid,
  _department_id uuid,
  _role_code text,
  _course_id uuid,
  _status text,
  _limit integer,
  _offset integer
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _today date := (timezone('utc', now()))::date;
  _limit_n integer := LEAST(GREATEST(COALESCE(_limit, 25), 1), 50);
  _offset_n integer := GREATEST(COALESCE(_offset, 0), 0);
  _wide boolean;
  _actor uuid;
  _courses jsonb;
  _rows jsonb;
  _total integer;
BEGIN
  _wide := public.training_code_allows('training.view') OR public.training_code_allows('training.analytics.view');
  _actor := public.training_actor_staff_id();
  IF NOT _wide AND _actor IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT _wide AND NOT public.training_code_allows('training.learn') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _location_id IS NOT NULL AND NOT public.user_can_access_location(_location_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', picked.id,
    'code', picked.code,
    'title', picked.title
  ) ORDER BY picked.title), '[]'::jsonb)
  INTO _courses
  FROM (
    SELECT c.id, c.code, c.title
    FROM public.training_courses c
    WHERE c.status = 'PUBLISHED'
      AND (_course_id IS NULL OR c.id = _course_id)
    ORDER BY c.title
    LIMIT CASE WHEN _course_id IS NULL THEN 8 ELSE 1 END
  ) picked;

  WITH people AS (
    SELECT s.id, s.full_name, s.employee_code
    FROM public.staff s
    WHERE s.deleted_at IS NULL
      AND s.status = 'active'
      AND (
        (_wide AND public.user_can_access_staff(s.id))
        OR (NOT _wide AND s.id = _actor)
      )
      AND (_location_id IS NULL OR s.location_id = _location_id)
      AND (
        _department_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.staff_departments sd
          WHERE sd.staff_id = s.id AND sd.department_id = _department_id
        )
      )
      AND (
        NULLIF(btrim(COALESCE(_role_code, '')), '') IS NULL
        OR s.job_title = btrim(_role_code)
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = s.user_id AND ur.role::text = btrim(_role_code)
        )
      )
  ),
  cells AS (
    SELECT
      p.id AS staff_id,
      course.id AS course_id,
      course.code AS course_code,
      public.training_matrix_cell(enr.id, enr.completed_at, cert.status, cert.valid_until, _today) AS cell_status
    FROM people p
    JOIN (
      SELECT c.id, c.code
      FROM public.training_courses c
      WHERE c.status = 'PUBLISHED'
        AND (_course_id IS NULL OR c.id = _course_id)
      ORDER BY c.title
      LIMIT CASE WHEN _course_id IS NULL THEN 8 ELSE 1 END
    ) course ON true
    LEFT JOIN LATERAL (
      SELECT e.id, e.completed_at
      FROM public.training_course_enrollments e
      WHERE e.staff_id = p.id AND e.course_id = course.id
      ORDER BY e.enrolled_at DESC
      LIMIT 1
    ) enr ON true
    LEFT JOIN public.training_certificates cert ON cert.enrollment_id = enr.id
  ),
  matched AS (
    SELECT p.id, p.full_name, p.employee_code
    FROM people p
    WHERE NULLIF(btrim(COALESCE(_status, '')), '') IS NULL
      OR EXISTS (
        SELECT 1 FROM cells c
        WHERE c.staff_id = p.id AND c.cell_status = btrim(_status)
      )
  )
  SELECT count(*) INTO _total FROM matched;

  WITH people AS (
    SELECT s.id, s.full_name, s.employee_code
    FROM public.staff s
    WHERE s.deleted_at IS NULL
      AND s.status = 'active'
      AND (
        (_wide AND public.user_can_access_staff(s.id))
        OR (NOT _wide AND s.id = _actor)
      )
      AND (_location_id IS NULL OR s.location_id = _location_id)
      AND (
        _department_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.staff_departments sd
          WHERE sd.staff_id = s.id AND sd.department_id = _department_id
        )
      )
      AND (
        NULLIF(btrim(COALESCE(_role_code, '')), '') IS NULL
        OR s.job_title = btrim(_role_code)
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = s.user_id AND ur.role::text = btrim(_role_code)
        )
      )
  ),
  cells AS (
    SELECT
      p.id AS staff_id,
      course.id AS course_id,
      course.code AS course_code,
      public.training_matrix_cell(enr.id, enr.completed_at, cert.status, cert.valid_until, _today) AS cell_status,
      comp.level AS competency_level
    FROM people p
    JOIN (
      SELECT c.id, c.code, c.competency_code
      FROM public.training_courses c
      WHERE c.status = 'PUBLISHED'
        AND (_course_id IS NULL OR c.id = _course_id)
      ORDER BY c.title
      LIMIT CASE WHEN _course_id IS NULL THEN 8 ELSE 1 END
    ) course ON true
    LEFT JOIN LATERAL (
      SELECT e.id, e.completed_at
      FROM public.training_course_enrollments e
      WHERE e.staff_id = p.id AND e.course_id = course.id
      ORDER BY e.enrolled_at DESC
      LIMIT 1
    ) enr ON true
    LEFT JOIN public.training_certificates cert ON cert.enrollment_id = enr.id
    LEFT JOIN LATERAL (
      SELECT k.level
      FROM public.training_competencies k
      WHERE k.staff_id = p.id
        AND course.competency_code IS NOT NULL
        AND k.code = course.competency_code
      ORDER BY k.awarded_at DESC
      LIMIT 1
    ) comp ON true
  ),
  matched AS (
    SELECT p.id, p.full_name, p.employee_code
    FROM people p
    WHERE NULLIF(btrim(COALESCE(_status, '')), '') IS NULL
      OR EXISTS (
        SELECT 1 FROM cells c
        WHERE c.staff_id = p.id AND c.cell_status = btrim(_status)
      )
    ORDER BY p.full_name
    LIMIT _limit_n OFFSET _offset_n
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'staffId', m.id,
    'fullName', m.full_name,
    'employeeCode', m.employee_code,
    'cells', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'courseId', c.course_id,
        'courseCode', c.course_code,
        'status', c.cell_status,
        'competency', c.competency_level
      )), '[]'::jsonb)
      FROM cells c
      WHERE c.staff_id = m.id
    )
  )), '[]'::jsonb)
  INTO _rows
  FROM matched m;

  RETURN jsonb_build_object('total', COALESCE(_total, 0), 'courses', _courses, 'rows', COALESCE(_rows, '[]'::jsonb));
END;
$fn$;

COMMENT ON FUNCTION public.training_matrix(uuid, uuid, text, uuid, text, integer, integer) IS
  'Paged staff by site scope. Cells are training status, employee name, and employee code.';

CREATE OR REPLACE FUNCTION public.training_materialize_path_certificate(_path_id uuid, _staff_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _existing uuid;
  _title text;
  _enabled boolean;
  _status text;
  _total integer;
  _done integer;
  _name text;
  _user uuid;
  _course uuid;
  _id uuid;
BEGIN
  IF NOT public.training_authoritative() THEN
    RAISE EXCEPTION 'certificates are server-authoritative';
  END IF;

  SELECT id INTO _existing
  FROM public.training_certificates
  WHERE path_id = _path_id AND staff_id = _staff_id;
  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  SELECT p.title, p.certificate_enabled, p.status
    INTO _title, _enabled, _status
  FROM public.training_paths p
  WHERE p.id = _path_id;
  IF _title IS NULL OR _status IS DISTINCT FROM 'PUBLISHED' OR NOT COALESCE(_enabled, false) THEN
    RETURN NULL;
  END IF;

  SELECT count(*), count(*) FILTER (
    WHERE EXISTS (
      SELECT 1
      FROM public.training_course_enrollments e
      WHERE e.staff_id = _staff_id
        AND e.course_id = i.course_id
        AND e.completed_at IS NOT NULL
    )
  )
  INTO _total, _done
  FROM public.training_path_items i
  WHERE i.path_id = _path_id;

  IF _total = 0 OR _done < _total THEN
    RETURN NULL;
  END IF;

  SELECT s.full_name, s.user_id INTO _name, _user
  FROM public.staff s
  WHERE s.id = _staff_id AND s.deleted_at IS NULL;
  IF _name IS NULL OR btrim(_name) = '' THEN
    RETURN NULL;
  END IF;

  SELECT i.course_id INTO _course
  FROM public.training_path_items i
  WHERE i.path_id = _path_id
  ORDER BY i.sort_order DESC
  LIMIT 1;

  PERFORM set_config('training.authoritative_write', '1', true);
  INSERT INTO public.training_certificates (
    path_id, staff_id, course_id, holder_name, course_title, course_code, status
  ) VALUES (
    _path_id, _staff_id, _course, btrim(_name), _title, NULL, 'VALID'
  )
  RETURNING id INTO _id;

  PERFORM public.training_write_audit(
    'certificate.issued', 'training_certificates', _id, NULL, NULL,
    jsonb_build_object('status', 'VALID', 'path_id', _path_id), NULL
  );

  IF _user IS NOT NULL THEN
    INSERT INTO public.notifications (
      user_id, category, title, body, severity, source_type, source_id, action_url
    ) VALUES (
      _user, 'training', 'Learning path certificate issued', _title, 'info',
      'training_certificate', _id, '/training/certificates'
    );
  END IF;

  RETURN _id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.training_issue_path_certificate(_path_id uuid, _staff_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _id uuid;
BEGIN
  IF NOT public.training_code_allows('training.certificate.issue') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT public.user_can_access_staff(_staff_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  PERFORM set_config('training.authoritative_write', '1', true);
  _id := public.training_materialize_path_certificate(_path_id, _staff_id);
  IF _id IS NULL THEN
    RAISE EXCEPTION 'learning path is not complete';
  END IF;
  RETURN _id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.training_materialize_staff_paths(_staff_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _path uuid;
BEGIN
  IF NOT public.training_authoritative() THEN
    RETURN;
  END IF;
  FOR _path IN
    SELECT p.id
    FROM public.training_paths p
    WHERE p.status = 'PUBLISHED'
      AND p.certificate_enabled
      AND EXISTS (
        SELECT 1 FROM public.training_path_items i WHERE i.path_id = p.id
      )
  LOOP
    PERFORM public.training_materialize_path_certificate(_path, _staff_id);
  END LOOP;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.training_try_complete_enrollment(_enrollment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _version uuid;
  _staff uuid;
  _lesson_count integer := 0;
  _gated boolean := false;
  _required_open boolean := false;
BEGIN
  SELECT e.version_id, e.staff_id INTO _version, _staff
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
      PERFORM public.training_materialize_staff_paths(_staff);
      RETURN true;
    END IF;
  END IF;
  RETURN false;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.training_requirement_status(
  _entity_type text,
  _entity_id uuid,
  _staff_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _today date := (timezone('utc', now()))::date;
  _rows jsonb;
BEGIN
  IF _staff_id IS DISTINCT FROM public.training_actor_staff_id()
    AND NOT public.user_can_access_staff(_staff_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'courseId', c.id,
    'courseCode', c.code,
    'courseTitle', c.title,
    'requirementType', l.requirement_type,
    'enforceMode', l.enforce_mode,
    'status', public.training_matrix_cell(enr.id, enr.completed_at, cert.status, cert.valid_until, _today)
  )), '[]'::jsonb)
  INTO _rows
  FROM public.training_entity_links l
  JOIN public.training_courses c ON c.id = l.course_id
  LEFT JOIN LATERAL (
    SELECT e.id, e.completed_at
    FROM public.training_course_enrollments e
    WHERE e.staff_id = _staff_id AND e.course_id = c.id
    ORDER BY e.enrolled_at DESC
    LIMIT 1
  ) enr ON true
  LEFT JOIN public.training_certificates cert ON cert.enrollment_id = enr.id
  WHERE l.entity_type = _entity_type
    AND l.entity_id = _entity_id
    AND l.course_id IS NOT NULL
    AND public.training_can_read_course(c.id);

  RETURN jsonb_build_object('requirements', COALESCE(_rows, '[]'::jsonb));
END;
$fn$;

COMMENT ON FUNCTION public.training_requirement_status(text, uuid, uuid) IS
  'Certification status for one employee against links stored for an outside record. Warn versus block is data. This function does not change the outside record.';

CREATE OR REPLACE FUNCTION public.training_dashboard(
  _location_id uuid,
  _department_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _today date := (timezone('utc', now()))::date;
  _enrollments integer;
  _completed integer;
  _overdue integer;
  _learners integer;
  _issued integer;
  _expiring integer;
  _avg numeric;
  _failed integer;
  _seconds bigint;
  _sessions integer;
  _courses integer;
BEGIN
  IF NOT public.training_code_allows('training.analytics.view') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _location_id IS NOT NULL AND NOT public.user_can_access_location(_location_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH people AS (
    SELECT s.id
    FROM public.staff s
    WHERE s.deleted_at IS NULL
      AND public.user_can_access_staff(s.id)
      AND (_location_id IS NULL OR s.location_id = _location_id)
      AND (
        _department_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.staff_departments sd
          WHERE sd.staff_id = s.id AND sd.department_id = _department_id
        )
      )
  )
  SELECT
    count(e.id),
    count(e.id) FILTER (WHERE e.completed_at IS NOT NULL),
    count(e.id) FILTER (WHERE e.completed_at IS NULL AND e.due_on IS NOT NULL AND e.due_on < _today),
    count(DISTINCT e.staff_id)
  INTO _enrollments, _completed, _overdue, _learners
  FROM public.training_course_enrollments e
  JOIN people p ON p.id = e.staff_id;

  SELECT count(*) INTO _courses
  FROM public.training_courses c
  WHERE c.status = 'PUBLISHED'
    AND (_location_id IS NULL OR c.location_id IS NULL OR c.location_id = _location_id);

  SELECT
    count(c.id),
    count(c.id) FILTER (
      WHERE c.status = 'VALID' AND c.valid_until IS NOT NULL AND c.valid_until <= _today + 30 AND c.valid_until >= _today
    ),
    round(avg(c.score), 1)
  INTO _issued, _expiring, _avg
  FROM public.training_certificates c
  JOIN public.staff s ON s.id = c.staff_id
  WHERE public.user_can_access_staff(s.id)
    AND (_location_id IS NULL OR s.location_id = _location_id)
    AND (
      _department_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.staff_departments sd
        WHERE sd.staff_id = s.id AND sd.department_id = _department_id
      )
    );

  SELECT count(*) INTO _failed
  FROM public.training_attempts a
  JOIN public.training_course_enrollments e ON e.id = a.enrollment_id
  JOIN public.staff s ON s.id = e.staff_id
  WHERE a.submitted_at IS NOT NULL
    AND a.passed IS FALSE
    AND public.user_can_access_staff(s.id)
    AND (_location_id IS NULL OR s.location_id = _location_id);

  SELECT COALESCE(sum(p.time_spent_seconds), 0) INTO _seconds
  FROM public.training_progress p
  JOIN public.training_course_enrollments e ON e.id = p.enrollment_id
  JOIN public.staff s ON s.id = e.staff_id
  WHERE public.user_can_access_staff(s.id)
    AND (_location_id IS NULL OR s.location_id = _location_id);

  SELECT count(*) INTO _sessions
  FROM public.training_sessions sess
  WHERE sess.status = 'SCHEDULED'
    AND sess.starts_at >= now()
    AND (_location_id IS NULL OR sess.location_id = _location_id)
    AND public.user_can_access_location(sess.location_id);

  RETURN jsonb_build_object(
    'activeCourses', COALESCE(_courses, 0),
    'learners', COALESCE(_learners, 0),
    'completionRate', CASE WHEN COALESCE(_enrollments, 0) = 0 THEN NULL ELSE round((100.0 * _completed) / _enrollments) END,
    'overdue', COALESCE(_overdue, 0),
    'certificatesIssued', COALESCE(_issued, 0),
    'certificatesExpiring', COALESCE(_expiring, 0),
    'averageScore', _avg,
    'failedAssessments', COALESCE(_failed, 0),
    'trainingHours', round(COALESCE(_seconds, 0) / 3600.0, 1),
    'upcomingSessions', COALESCE(_sessions, 0),
    'complianceGaps', COALESCE(_overdue, 0)
  );
END;
$fn$;

COMMENT ON FUNCTION public.training_dashboard(uuid, uuid) IS
  'Counts for staff and sessions the caller can already access. No employee names and no identity documents.';

DROP POLICY IF EXISTS training_path_items_update ON public.training_path_items;
CREATE POLICY training_path_items_update ON public.training_path_items
  FOR UPDATE TO authenticated
  USING (public.training_code_allows('training.edit') AND public.training_can_read_path(path_id))
  WITH CHECK (public.training_code_allows('training.edit') AND public.training_can_read_path(path_id));

DROP POLICY IF EXISTS training_path_items_delete ON public.training_path_items;
CREATE POLICY training_path_items_delete ON public.training_path_items
  FOR DELETE TO authenticated
  USING (public.training_code_allows('training.edit') AND public.training_can_read_path(path_id));

DROP POLICY IF EXISTS training_entity_links_delete ON public.training_entity_links;
CREATE POLICY training_entity_links_delete ON public.training_entity_links
  FOR DELETE TO authenticated
  USING (public.training_code_allows('training.edit') AND created_by = auth.uid());

GRANT DELETE ON public.training_path_items TO authenticated;
GRANT UPDATE ON public.training_path_items TO authenticated;
GRANT DELETE ON public.training_entity_links TO authenticated;

REVOKE ALL ON FUNCTION public.training_matrix_cell(uuid, timestamptz, text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.training_matrix_cell(uuid, timestamptz, text, date, date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.training_matrix(uuid, uuid, text, uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.training_matrix(uuid, uuid, text, uuid, text, integer, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.training_materialize_path_certificate(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.training_materialize_path_certificate(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.training_materialize_staff_paths(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.training_materialize_staff_paths(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.training_issue_path_certificate(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.training_issue_path_certificate(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.training_requirement_status(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.training_requirement_status(text, uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.training_dashboard(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.training_dashboard(uuid, uuid) TO authenticated, service_role;
