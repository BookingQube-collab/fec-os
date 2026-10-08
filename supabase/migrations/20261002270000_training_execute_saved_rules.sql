-- Runs stored training_saved_rules for one employee.
-- JOIN_COMPANY, ROLE_CHANGE, and MACHINE_ASSIGNMENT enroll that person when the
-- saved target matches. BUSINESS_UNIT, TEAM, and CUSTOM stay unexpanded.
-- training_entity_links.enforce_mode is returned as requirement rows.
-- This function does not write a score, completed_at, or status COMPLETED.

CREATE OR REPLACE FUNCTION public.training_execute_saved_rules(
  _trigger text,
  _staff_id uuid,
  _link_types text[],
  _entity_id uuid,
  _role_code text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _actor uuid := auth.uid();
  _staff record;
  _rule record;
  _due date;
  _assignment uuid;
  _enrolled integer := 0;
  _today date := (timezone('Asia/Qatar', now()))::date;
  _requirements jsonb := '[]'::jsonb;
  _titles jsonb := '[]'::jsonb;
  _allowed boolean := false;
  _matched boolean := false;
  _open boolean := false;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _trigger NOT IN ('JOIN_COMPANY', 'ROLE_CHANGE', 'MACHINE_ASSIGNMENT') THEN
    RAISE EXCEPTION 'unknown training trigger';
  END IF;

  SELECT s.id, s.user_id, s.location_id, s.staff_role, s.employment_type, s.status, s.deleted_at
    INTO _staff
  FROM public.staff s
  WHERE s.id = _staff_id;

  IF _staff.id IS NULL OR _staff.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  _allowed := public.user_can_access_staff(_staff.id);
  IF NOT _allowed AND _staff.location_id IS NOT NULL THEN
    _allowed := public.user_can_access_location(_staff.location_id);
  END IF;
  IF NOT _allowed AND _entity_id IS NOT NULL THEN
    SELECT public.user_can_access_location(m.location_id)
      INTO _allowed
    FROM public.arcade_machines m
    WHERE m.id = _entity_id;
    _allowed := COALESCE(_allowed, false);
  END IF;
  IF NOT _allowed THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  _open := _staff.status IS NOT NULL
    AND _staff.status NOT IN ('terminated', 'resigned', 'released', 'joker');

  IF _entity_id IS NOT NULL AND COALESCE(cardinality(_link_types), 0) > 0 THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'courseTitle', c.title,
      'status', public.training_matrix_cell(enr.id, enr.completed_at, cert.status, cert.valid_until, _today),
      'enforceMode', l.enforce_mode,
      'requirementType', l.requirement_type
    )), '[]'::jsonb)
      INTO _requirements
    FROM public.training_entity_links l
    JOIN public.training_courses c ON c.id = l.course_id
    LEFT JOIN LATERAL (
      SELECT e.id, e.completed_at
      FROM public.training_course_enrollments e
      WHERE e.staff_id = _staff.id
        AND e.course_id = c.id
      ORDER BY e.enrolled_at DESC
      LIMIT 1
    ) enr ON true
    LEFT JOIN public.training_certificates cert ON cert.enrollment_id = enr.id
    WHERE l.entity_id = _entity_id
      AND l.entity_type = ANY(_link_types)
      AND l.course_id IS NOT NULL;
  END IF;

  IF _open THEN
    FOR _rule IN
      SELECT *
      FROM public.training_saved_rules r
      WHERE r.trigger_kind = _trigger
        AND r.target NOT IN ('BUSINESS_UNIT', 'TEAM', 'CUSTOM')
    LOOP
      _matched := false;
      IF _rule.target = 'COMPANY' THEN
        _matched := true;
      ELSIF _rule.target = 'EMPLOYEE' THEN
        _matched := _rule.staff_id = _staff.id;
      ELSIF _rule.target = 'SITE' THEN
        _matched := _rule.location_id IS NOT NULL AND _rule.location_id = _staff.location_id;
      ELSIF _rule.target = 'DEPARTMENT' THEN
        _matched := _rule.department_id IS NOT NULL AND EXISTS (
          SELECT 1
          FROM public.staff_departments sd
          WHERE sd.staff_id = _staff.id
            AND sd.department_id = _rule.department_id
        );
      ELSIF _rule.target = 'EMPLOYEE_TYPE' THEN
        _matched := _rule.employment_type IS NOT NULL AND _rule.employment_type = _staff.employment_type;
      ELSIF _rule.target = 'ROLE' THEN
        _matched := _rule.role_code IS NOT NULL AND (
          _rule.role_code = COALESCE(NULLIF(btrim(_role_code), ''), _staff.staff_role::text)
          OR (
            NULLIF(btrim(_role_code), '') IS NULL
            AND EXISTS (
              SELECT 1
              FROM public.user_roles ur
              WHERE ur.user_id = _staff.user_id
                AND ur.role::text = _rule.role_code
            )
          )
        );
      END IF;

      IF NOT _matched THEN
        CONTINUE;
      END IF;
      IF EXISTS (
        SELECT 1
        FROM public.training_course_enrollments e
        WHERE e.staff_id = _staff.id
          AND e.version_id = _rule.version_id
      ) THEN
        CONTINUE;
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM public.training_course_versions v
        JOIN public.training_courses c ON c.id = v.course_id
        WHERE v.id = _rule.version_id
          AND v.course_id = _rule.course_id
          AND v.status = 'PUBLISHED'
          AND c.status = 'PUBLISHED'
      ) THEN
        CONTINUE;
      END IF;

      _due := CASE
        WHEN _rule.due_offset_days IS NULL THEN NULL
        ELSE _today + _rule.due_offset_days
      END;

      INSERT INTO public.training_assignments (
        course_id, version_id, start_on, due_on, required, priority, reason, reminder_offsets_days, created_by
      ) VALUES (
        _rule.course_id,
        _rule.version_id,
        _today,
        _due,
        _rule.required,
        _rule.priority,
        _rule.reason,
        _rule.reminder_offsets_days,
        _actor
      )
      RETURNING id INTO _assignment;

      INSERT INTO public.training_assignment_rules (
        assignment_id, target, staff_id
      ) VALUES (
        _assignment, 'EMPLOYEE', _staff.id
      );

      INSERT INTO public.training_course_enrollments (
        staff_id, course_id, version_id, assignment_id, status, due_on
      ) VALUES (
        _staff.id, _rule.course_id, _rule.version_id, _assignment, 'ENROLLED', _due
      )
      ON CONFLICT (staff_id, version_id) DO NOTHING;

      IF FOUND THEN
        _enrolled := _enrolled + 1;
        SELECT _titles || jsonb_build_array(c.title)
          INTO _titles
        FROM public.training_courses c
        WHERE c.id = _rule.course_id;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'enrolled', _enrolled,
    'courseTitles', COALESCE(_titles, '[]'::jsonb),
    'requirements', COALESCE(_requirements, '[]'::jsonb)
  );
END;
$fn$;

COMMENT ON FUNCTION public.training_execute_saved_rules(text, uuid, text[], uuid, text) IS
  'Enrolls one in-scope employee from matching training_saved_rules. Does not write a score or completion. Requirement rows carry enforce_mode for the caller to warn or block.';

REVOKE ALL ON FUNCTION public.training_execute_saved_rules(text, uuid, text[], uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.training_execute_saved_rules(text, uuid, text[], uuid, text) TO authenticated, service_role;
