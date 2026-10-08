-- Practical attempts are tied to one lesson and are insert-only.
-- A later result does not update or delete an earlier attempt.
-- This function does not write an enrollment score and does not insert a certificate.

ALTER TABLE public.training_practical_assessments
  ADD COLUMN IF NOT EXISTS lesson_id uuid REFERENCES public.training_lessons(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS confirmation_name text,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid;

CREATE INDEX IF NOT EXISTS training_practical_lesson_idx
  ON public.training_practical_assessments (enrollment_id, lesson_id, created_at);

COMMENT ON COLUMN public.training_practical_assessments.lesson_id IS
  'Practical lesson this attempt grades. History is one row per attempt.';

COMMENT ON COLUMN public.training_practical_assessments.confirmation_name IS
  'Name the assessor typed to confirm the result. Not a signature image.';

CREATE OR REPLACE FUNCTION public.training_practical_checklist(_body text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $fn$
DECLARE
  _parsed jsonb;
  _items jsonb := '[]'::jsonb;
  _elem jsonb;
  _line text;
  _id text;
  _label text;
  _required boolean;
BEGIN
  IF _body IS NULL OR btrim(_body) = '' THEN
    RETURN '[]'::jsonb;
  END IF;
  IF left(btrim(_body), 1) = '[' THEN
    BEGIN
      _parsed := btrim(_body)::jsonb;
    EXCEPTION WHEN others THEN
      _parsed := NULL;
    END;
  END IF;
  IF _parsed IS NOT NULL AND jsonb_typeof(_parsed) = 'array' THEN
    FOR _elem IN SELECT value FROM jsonb_array_elements(_parsed) LOOP
      IF jsonb_typeof(_elem) = 'string' THEN
        _label := btrim(_elem #>> '{}');
        IF _label <> '' THEN
          _items := _items || jsonb_build_array(jsonb_build_object('id', _label, 'label', _label, 'required', true));
        END IF;
      ELSIF jsonb_typeof(_elem) = 'object' AND coalesce(btrim(_elem->>'label'), '') <> '' THEN
        _label := btrim(_elem->>'label');
        _id := coalesce(nullif(btrim(_elem->>'id'), ''), _label);
        _required := NOT (_elem ? 'required' AND _elem->'required' = 'false'::jsonb);
        _items := _items || jsonb_build_array(jsonb_build_object('id', _id, 'label', _label, 'required', _required));
      END IF;
    END LOOP;
    RETURN _items;
  END IF;
  FOR _line IN SELECT btrim(line) FROM regexp_split_to_table(_body, E'\n') AS line LOOP
    IF _line <> '' THEN
      _items := _items || jsonb_build_array(jsonb_build_object('id', _line, 'label', _line, 'required', true));
    END IF;
  END LOOP;
  RETURN _items;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.training_practical_grade(
  _enrollment_id uuid,
  _lesson_id uuid,
  _items jsonb,
  _result text,
  _notes text,
  _confirmation_name text,
  _confirmed boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _staff uuid := public.training_actor_staff_id();
  _owner uuid;
  _version uuid;
  _status text;
  _kind text;
  _body text;
  _checklist jsonb;
  _required_open_item boolean := false;
  _passed boolean := false;
  _attempt uuid;
  _rubric jsonb;
  _lesson_done boolean := false;
  _course boolean := false;
  _gated boolean := false;
  _required_open boolean := false;
  _lesson_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.training_code_allows('training.assessment.grade') THEN
    RAISE EXCEPTION 'training.assessment.grade required';
  END IF;
  IF _result NOT IN ('PASS', 'FAIL') THEN
    RAISE EXCEPTION 'result must be PASS or FAIL';
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' THEN
    RAISE EXCEPTION 'checklist results must be a list';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_items) elem
    WHERE elem ? 'score' OR elem ? 'passed' OR elem ? 'clientScore'
  ) THEN
    RAISE EXCEPTION 'client score rejected';
  END IF;
  IF NOT coalesce(_confirmed, false) AND coalesce(btrim(_confirmation_name), '') = '' THEN
    RAISE EXCEPTION 'confirmation required';
  END IF;

  SELECT e.staff_id, e.version_id, v.status, l.kind, l.body
    INTO _owner, _version, _status, _kind, _body
  FROM public.training_course_enrollments e
  JOIN public.training_course_versions v ON v.id = e.version_id
  JOIN public.training_lessons l ON l.id = _lesson_id
  JOIN public.training_sections s ON s.id = l.section_id AND s.version_id = e.version_id
  WHERE e.id = _enrollment_id;

  IF _owner IS NULL OR _kind IS NULL THEN
    RAISE EXCEPTION 'lesson not in enrollment';
  END IF;
  IF _staff IS NOT NULL AND _staff = _owner THEN
    RAISE EXCEPTION 'learner cannot grade their own practical';
  END IF;
  IF NOT public.user_can_access_staff(_owner) THEN
    RAISE EXCEPTION 'grader is outside staff scope';
  END IF;
  IF _status IS DISTINCT FROM 'PUBLISHED' THEN
    RAISE EXCEPTION 'practical is not on a published version';
  END IF;
  IF _kind IS DISTINCT FROM 'PRACTICAL_ASSESSMENT' THEN
    RAISE EXCEPTION 'lesson is not a practical assessment';
  END IF;

  _checklist := public.training_practical_checklist(_body);
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_items) elem
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(_checklist) item
      WHERE item->>'id' = elem->>'id'
    )
  ) THEN
    RAISE EXCEPTION 'item is not on the checklist';
  END IF;

  SELECT coalesce(bool_or(
    coalesce(item->>'required', 'true') <> 'false'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(_items) given
      WHERE given->>'id' = item->>'id'
        AND given->>'met' = 'true'
    )
  ), false)
    INTO _required_open_item
  FROM jsonb_array_elements(_checklist) item;

  IF _result = 'PASS' AND (jsonb_array_length(_checklist) = 0 OR _required_open_item) THEN
    RAISE EXCEPTION 'required item not met';
  END IF;
  _passed := _result = 'PASS';

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', item->>'id',
      'label', item->>'label',
      'required', coalesce(item->>'required', 'true') <> 'false',
      'met', EXISTS (
        SELECT 1 FROM jsonb_array_elements(_items) given
        WHERE given->>'id' = item->>'id' AND given->>'met' = 'true'
      )
    )
  ), '[]'::jsonb)
    INTO _rubric
  FROM jsonb_array_elements(_checklist) item;

  PERFORM set_config('training.authoritative_write', '1', true);
  INSERT INTO public.training_practical_assessments (
    enrollment_id, lesson_id, assessor_staff_id, rubric, passed, notes, assessed_at, confirmation_name, confirmed_by
  ) VALUES (
    _enrollment_id,
    _lesson_id,
    _staff,
    jsonb_build_object('items', _rubric),
    _passed,
    nullif(btrim(coalesce(_notes, '')), ''),
    now(),
    nullif(btrim(coalesce(_confirmation_name, '')), ''),
    auth.uid()
  )
  RETURNING id INTO _attempt;

  IF _passed THEN
    INSERT INTO public.training_progress (enrollment_id, lesson_id)
    VALUES (_enrollment_id, _lesson_id)
    ON CONFLICT (enrollment_id, lesson_id) DO NOTHING;

    UPDATE public.training_progress
    SET completed_at = now()
    WHERE enrollment_id = _enrollment_id
      AND lesson_id = _lesson_id
      AND completed_at IS NULL;

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
      ON p.lesson_id = l.id AND p.enrollment_id = _enrollment_id
    WHERE s.version_id = _version;

    IF _lesson_count > 0 AND NOT _gated AND NOT _required_open THEN
      UPDATE public.training_course_enrollments
      SET status = 'COMPLETED',
          completed_at = COALESCE(completed_at, now())
      WHERE id = _enrollment_id
        AND completed_at IS NULL;
      IF FOUND THEN
        _course := true;
      END IF;
    END IF;
  END IF;

  SELECT p.completed_at IS NOT NULL INTO _lesson_done
  FROM public.training_progress p
  WHERE p.enrollment_id = _enrollment_id
    AND p.lesson_id = _lesson_id;

  RETURN jsonb_build_object(
    'attemptId', _attempt,
    'passed', _passed,
    'lessonCompleted', coalesce(_lesson_done, false),
    'courseCompleted', _course OR EXISTS (
      SELECT 1 FROM public.training_course_enrollments e
      WHERE e.id = _enrollment_id AND e.completed_at IS NOT NULL
    )
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.training_practical_queue(_limit integer, _offset integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _total integer := 0;
  _rows jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.training_code_allows('training.assessment.grade') THEN
    RAISE EXCEPTION 'training.assessment.grade required';
  END IF;
  IF _limit IS NULL OR _limit < 1 OR _limit > 20 OR _offset IS NULL OR _offset < 0 THEN
    RAISE EXCEPTION 'page is out of range';
  END IF;

  SELECT count(*) INTO _total
  FROM public.training_lessons l
  JOIN public.training_sections sec ON sec.id = l.section_id
  JOIN public.training_course_versions v ON v.id = sec.version_id AND v.status = 'PUBLISHED'
  JOIN public.training_course_enrollments e ON e.version_id = v.id
  JOIN public.staff s ON s.id = e.staff_id
  LEFT JOIN public.training_progress p ON p.enrollment_id = e.id AND p.lesson_id = l.id
  WHERE l.kind = 'PRACTICAL_ASSESSMENT'
    AND p.completed_at IS NULL
    AND public.user_can_access_staff(e.staff_id);

  SELECT coalesce(jsonb_agg(row_to_json(q)::jsonb), '[]'::jsonb) INTO _rows
  FROM (
    SELECT
      e.id AS "enrollmentId",
      l.id AS "lessonId",
      s.full_name AS "staffName",
      s.employee_code AS "employeeCode",
      c.title AS "courseTitle",
      l.title AS "lessonTitle",
      e.due_on AS "dueOn"
    FROM public.training_lessons l
    JOIN public.training_sections sec ON sec.id = l.section_id
    JOIN public.training_course_versions v ON v.id = sec.version_id AND v.status = 'PUBLISHED'
    JOIN public.training_course_enrollments e ON e.version_id = v.id
    JOIN public.training_courses c ON c.id = e.course_id
    JOIN public.staff s ON s.id = e.staff_id
    LEFT JOIN public.training_progress p ON p.enrollment_id = e.id AND p.lesson_id = l.id
    WHERE l.kind = 'PRACTICAL_ASSESSMENT'
      AND p.completed_at IS NULL
      AND public.user_can_access_staff(e.staff_id)
    ORDER BY e.due_on NULLS LAST, s.full_name, l.title
    LIMIT _limit OFFSET _offset
  ) q;

  RETURN jsonb_build_object('total', _total, 'rows', _rows);
END;
$fn$;

COMMENT ON FUNCTION public.training_practical_grade(uuid, uuid, jsonb, text, text, text, boolean) IS
  'Records a new practical attempt for an in-scope learner. PASS requires every required checklist item. Does not write an enrollment score and does not insert a certificate.';

REVOKE ALL ON FUNCTION public.training_practical_checklist(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_practical_grade(uuid, uuid, jsonb, text, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.training_practical_queue(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.training_practical_grade(uuid, uuid, jsonb, text, text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_practical_queue(integer, integer) TO authenticated, service_role;
