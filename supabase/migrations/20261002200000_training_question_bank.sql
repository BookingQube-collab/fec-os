-- Question bank and quiz attempts.
-- Correct answers live only in training_bank_question_keys.
-- Learners receive stems for the served subset. Scoring happens in training_quiz_submit.
-- This migration does not insert a certificate and does not write an enrollment score.

CREATE TABLE public.training_question_banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text,
  tags text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_question_banks_name_chk CHECK (char_length(btrim(name)) BETWEEN 1 AND 200)
);

CREATE TABLE public.training_bank_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id uuid NOT NULL REFERENCES public.training_question_banks(id) ON DELETE CASCADE,
  kind text NOT NULL,
  prompt text NOT NULL,
  difficulty text,
  tags text[] NOT NULL DEFAULT '{}',
  topic text,
  course_id uuid REFERENCES public.training_courses(id) ON DELETE SET NULL,
  points integer NOT NULL DEFAULT 1,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  scenario_prompt text,
  inner_kind text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_bank_questions_kind_chk CHECK (
    kind IN (
      'MULTIPLE_CHOICE', 'MULTIPLE_SELECT', 'TRUE_FALSE', 'YES_NO',
      'SHORT_ANSWER', 'ORDERING', 'MATCHING', 'SCENARIO'
    )
  ),
  CONSTRAINT training_bank_questions_difficulty_chk CHECK (
    difficulty IS NULL OR difficulty IN ('EASY', 'MEDIUM', 'HARD')
  ),
  CONSTRAINT training_bank_questions_points_chk CHECK (points BETWEEN 1 AND 100),
  CONSTRAINT training_bank_questions_options_chk CHECK (jsonb_typeof(options) = 'array'),
  CONSTRAINT training_bank_questions_scenario_chk CHECK (
    (kind <> 'SCENARIO' AND inner_kind IS NULL)
    OR (
      kind = 'SCENARIO'
      AND inner_kind IN (
        'MULTIPLE_CHOICE', 'MULTIPLE_SELECT', 'TRUE_FALSE', 'YES_NO',
        'SHORT_ANSWER', 'ORDERING', 'MATCHING'
      )
    )
  )
);

CREATE TABLE public.training_bank_question_keys (
  question_id uuid PRIMARY KEY REFERENCES public.training_bank_questions(id) ON DELETE CASCADE,
  correct jsonb NOT NULL,
  explanation text,
  CONSTRAINT training_bank_question_keys_obj_chk CHECK (jsonb_typeof(correct) = 'object')
);

COMMENT ON TABLE public.training_bank_question_keys IS
  'Correct answers and explanations. Readable only with training.assessment.manage.';

CREATE TABLE public.training_lesson_quizzes (
  lesson_id uuid PRIMARY KEY REFERENCES public.training_lessons(id) ON DELETE CASCADE,
  bank_id uuid NOT NULL REFERENCES public.training_question_banks(id),
  draw_count integer NOT NULL,
  passing_score numeric NOT NULL DEFAULT 70,
  max_attempts integer NOT NULL DEFAULT 1,
  shuffle_questions boolean NOT NULL DEFAULT true,
  shuffle_options boolean NOT NULL DEFAULT true,
  CONSTRAINT training_lesson_quizzes_draw_chk CHECK (draw_count BETWEEN 1 AND 100),
  CONSTRAINT training_lesson_quizzes_pass_chk CHECK (passing_score >= 0 AND passing_score <= 100),
  CONSTRAINT training_lesson_quizzes_attempts_chk CHECK (max_attempts BETWEEN 1 AND 20)
);

CREATE TABLE public.training_quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.training_course_enrollments(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.training_lessons(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL,
  served_question_ids uuid[] NOT NULL,
  option_order jsonb NOT NULL DEFAULT '{}'::jsonb,
  answers jsonb,
  score numeric,
  passed boolean,
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  CONSTRAINT training_quiz_attempts_served_chk CHECK (cardinality(served_question_ids) > 0),
  CONSTRAINT training_quiz_attempts_answers_chk CHECK (answers IS NULL OR jsonb_typeof(answers) = 'array')
);

CREATE UNIQUE INDEX training_quiz_attempts_open_idx
  ON public.training_quiz_attempts (enrollment_id, lesson_id)
  WHERE submitted_at IS NULL;

CREATE INDEX training_bank_questions_bank_idx ON public.training_bank_questions (bank_id, created_at);
CREATE INDEX training_quiz_attempts_staff_idx ON public.training_quiz_attempts (staff_id, lesson_id);

CREATE OR REPLACE FUNCTION public.training_tg_strip_question_flags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF jsonb_typeof(NEW.options) = 'array' THEN
    SELECT coalesce(jsonb_agg(
      CASE
        WHEN jsonb_typeof(elem) = 'object'
          THEN elem - 'is_correct' - 'isCorrect' - 'correct' - 'explanation' - 'answerKey'
        ELSE elem
      END
      ORDER BY ord
    ), '[]'::jsonb)
    INTO NEW.options
    FROM jsonb_array_elements(NEW.options) WITH ORDINALITY AS t(elem, ord);
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_training_bank_questions_strip
  BEFORE INSERT OR UPDATE ON public.training_bank_questions
  FOR EACH ROW EXECUTE FUNCTION public.training_tg_strip_question_flags();

CREATE TRIGGER trg_training_quiz_attempt_authority
  BEFORE INSERT OR UPDATE ON public.training_quiz_attempts
  FOR EACH ROW EXECUTE FUNCTION public.training_tg_attempt_authority();

CREATE OR REPLACE FUNCTION public.training_key_is_usable(_kind text, _inner_kind text, _correct jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $fn$
DECLARE
  _used text := CASE WHEN _kind = 'SCENARIO' THEN _inner_kind ELSE _kind END;
BEGIN
  IF _correct IS NULL OR jsonb_typeof(_correct) <> 'object' THEN
    RETURN false;
  END IF;
  IF _kind = 'SCENARIO' AND (_inner_kind IS NULL OR _inner_kind = 'SCENARIO') THEN
    RETURN false;
  END IF;
  IF _used = 'MULTIPLE_CHOICE' THEN
    RETURN coalesce(_correct->>'optionId', '') <> '';
  ELSIF _used = 'MULTIPLE_SELECT' THEN
    RETURN jsonb_typeof(_correct->'optionIds') = 'array' AND jsonb_array_length(_correct->'optionIds') > 0;
  ELSIF _used = 'TRUE_FALSE' THEN
    RETURN jsonb_typeof(_correct->'value') = 'boolean';
  ELSIF _used = 'YES_NO' THEN
    RETURN _correct->>'value' IN ('yes', 'no');
  ELSIF _used = 'SHORT_ANSWER' THEN
    RETURN jsonb_typeof(_correct->'answers') = 'array' AND jsonb_array_length(_correct->'answers') > 0;
  ELSIF _used = 'ORDERING' THEN
    RETURN jsonb_typeof(_correct->'order') = 'array' AND jsonb_array_length(_correct->'order') > 0;
  ELSIF _used = 'MATCHING' THEN
    RETURN jsonb_typeof(_correct->'pairs') = 'array' AND jsonb_array_length(_correct->'pairs') > 0;
  END IF;
  RETURN false;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.training_grade_answer(
  _kind text,
  _inner_kind text,
  _correct jsonb,
  _answer jsonb
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $fn$
DECLARE
  _used text := CASE WHEN _kind = 'SCENARIO' THEN _inner_kind ELSE _kind END;
  _expected text[];
  _got text[];
BEGIN
  IF NOT public.training_key_is_usable(_kind, _inner_kind, _correct) THEN
    RETURN false;
  END IF;
  IF _answer IS NULL OR jsonb_typeof(_answer) <> 'object' THEN
    RETURN false;
  END IF;
  IF _used = 'MULTIPLE_CHOICE' THEN
    RETURN _answer->>'value' = _correct->>'optionId';
  ELSIF _used = 'TRUE_FALSE' THEN
    RETURN jsonb_typeof(_answer->'value') = 'boolean'
      AND (_answer->>'value')::boolean = (_correct->>'value')::boolean;
  ELSIF _used = 'YES_NO' THEN
    RETURN _answer->>'value' IN ('yes', 'no') AND _answer->>'value' = _correct->>'value';
  ELSIF _used = 'SHORT_ANSWER' THEN
    RETURN EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(_correct->'answers') AS accepted
      WHERE btrim(accepted) <> ''
        AND lower(btrim(accepted)) = lower(btrim(coalesce(_answer->>'value', '')))
    );
  ELSIF _used = 'MULTIPLE_SELECT' THEN
    IF jsonb_typeof(_answer->'value') <> 'array' THEN
      RETURN false;
    END IF;
    SELECT coalesce(array_agg(x ORDER BY x), '{}') INTO _expected
    FROM jsonb_array_elements_text(_correct->'optionIds') AS x;
    SELECT coalesce(array_agg(x ORDER BY x), '{}') INTO _got
    FROM jsonb_array_elements_text(_answer->'value') AS x;
    RETURN cardinality(_expected) > 0 AND _expected = _got;
  ELSIF _used = 'ORDERING' THEN
    IF jsonb_typeof(_answer->'order') <> 'array' THEN
      RETURN false;
    END IF;
    SELECT coalesce(array_agg(x ORDER BY ordinality), '{}') INTO _expected
    FROM jsonb_array_elements_text(_correct->'order') WITH ORDINALITY AS t(x, ordinality);
    SELECT coalesce(array_agg(x ORDER BY ordinality), '{}') INTO _got
    FROM jsonb_array_elements_text(_answer->'order') WITH ORDINALITY AS t(x, ordinality);
    RETURN cardinality(_expected) > 0 AND _expected = _got;
  ELSIF _used = 'MATCHING' THEN
    IF jsonb_typeof(_answer->'pairs') <> 'array' THEN
      RETURN false;
    END IF;
    RETURN (
      SELECT coalesce(jsonb_agg(pair ORDER BY pair->>0, pair->>1), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_array(elem->>'left', elem->>'right') AS pair
        FROM jsonb_array_elements(_correct->'pairs') elem
        WHERE coalesce(elem->>'left', '') <> '' AND coalesce(elem->>'right', '') <> ''
      ) s
    ) = (
      SELECT coalesce(jsonb_agg(pair ORDER BY pair->>0, pair->>1), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_array(elem->>'left', elem->>'right') AS pair
        FROM jsonb_array_elements(_answer->'pairs') elem
        WHERE coalesce(elem->>'left', '') <> '' AND coalesce(elem->>'right', '') <> ''
      ) s
    );
  END IF;
  RETURN false;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.training_quiz_public_questions(_ids uuid[], _option_order jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'prompt', q.prompt,
      'kind', q.kind,
      'scenarioPrompt', q.scenario_prompt,
      'innerKind', q.inner_kind,
      'options', (
        SELECT coalesce(jsonb_agg(
          jsonb_build_object('id', elem->>'id', 'label', elem->>'label', 'side', elem->>'side')
          ORDER BY coalesce(
            array_position(
              ARRAY(SELECT jsonb_array_elements_text(_option_order -> (q.id::text))),
              elem->>'id'
            ),
            1000000
          ),
          ord
        ), '[]'::jsonb)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY AS t(elem, ord)
      )
    )
    ORDER BY array_position(_ids, q.id)
  ), '[]'::jsonb)
  FROM public.training_bank_questions q
  WHERE q.id = ANY (_ids);
$fn$;

CREATE OR REPLACE FUNCTION public.training_quiz_start(_enrollment_id uuid, _lesson_id uuid)
RETURNS jsonb
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
  _bank uuid;
  _draw integer;
  _max integer;
  _shuffle_q boolean;
  _shuffle_o boolean;
  _submitted integer := 0;
  _ids uuid[] := '{}';
  _available integer := 0;
  _order jsonb := '{}'::jsonb;
  _qid uuid;
  _opts jsonb;
  _opt_ids jsonb;
  _attempt uuid;
  _open uuid;
  _open_ids uuid[];
  _open_order jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _staff IS NULL THEN
    RAISE EXCEPTION 'no staff profile';
  END IF;

  SELECT e.staff_id, e.version_id, v.status, l.kind
    INTO _owner, _version, _status, _kind
  FROM public.training_course_enrollments e
  JOIN public.training_course_versions v ON v.id = e.version_id
  JOIN public.training_lessons l ON l.id = _lesson_id
  JOIN public.training_sections s ON s.id = l.section_id AND s.version_id = e.version_id
  WHERE e.id = _enrollment_id;

  IF _owner IS NULL OR _kind IS NULL THEN
    RAISE EXCEPTION 'lesson not in enrollment';
  END IF;
  IF _owner IS DISTINCT FROM _staff THEN
    RAISE EXCEPTION 'attempt belongs to another employee';
  END IF;
  IF _status IS DISTINCT FROM 'PUBLISHED' THEN
    RAISE EXCEPTION 'quiz is not on a published version';
  END IF;
  IF _kind IS DISTINCT FROM 'QUIZ' THEN
    RAISE EXCEPTION 'lesson is not a quiz';
  END IF;

  SELECT q.bank_id, q.draw_count, q.max_attempts, q.shuffle_questions, q.shuffle_options
    INTO _bank, _draw, _max, _shuffle_q, _shuffle_o
  FROM public.training_lesson_quizzes q
  WHERE q.lesson_id = _lesson_id;
  IF _bank IS NULL THEN
    RAISE EXCEPTION 'quiz is not configured';
  END IF;

  SELECT count(*) INTO _submitted
  FROM public.training_quiz_attempts a
  WHERE a.enrollment_id = _enrollment_id
    AND a.lesson_id = _lesson_id
    AND a.submitted_at IS NOT NULL;

  SELECT a.id, a.served_question_ids, a.option_order
    INTO _open, _open_ids, _open_order
  FROM public.training_quiz_attempts a
  WHERE a.enrollment_id = _enrollment_id
    AND a.lesson_id = _lesson_id
    AND a.submitted_at IS NULL
    AND a.staff_id = _staff;

  IF _open IS NOT NULL THEN
    RETURN jsonb_build_object(
      'attemptId', _open,
      'questions', public.training_quiz_public_questions(_open_ids, _open_order),
      'attemptsRemaining', GREATEST(_max - _submitted, 0),
      'submitted', false
    );
  END IF;

  IF _submitted >= _max THEN
    RAISE EXCEPTION 'no attempts remaining';
  END IF;

  SELECT count(*) INTO _available
  FROM public.training_bank_questions q
  JOIN public.training_bank_question_keys k ON k.question_id = q.id
  WHERE q.bank_id = _bank
    AND public.training_key_is_usable(q.kind, q.inner_kind, k.correct);
  IF _available < _draw THEN
    RAISE EXCEPTION 'not enough questions in the bank';
  END IF;

  SELECT coalesce(array_agg(picked.id ORDER BY picked.ord), '{}')
    INTO _ids
  FROM (
    SELECT q.id, row_number() OVER (
      ORDER BY CASE WHEN _shuffle_q THEN random() ELSE 0 END, q.created_at
    ) AS ord
    FROM public.training_bank_questions q
    JOIN public.training_bank_question_keys k ON k.question_id = q.id
    WHERE q.bank_id = _bank
      AND public.training_key_is_usable(q.kind, q.inner_kind, k.correct)
    ORDER BY CASE WHEN _shuffle_q THEN random() ELSE 0 END, q.created_at
    LIMIT _draw
  ) picked;

  FOREACH _qid IN ARRAY _ids LOOP
    SELECT options INTO _opts FROM public.training_bank_questions WHERE id = _qid;
    IF _shuffle_o THEN
      SELECT coalesce(jsonb_agg(to_jsonb(elem->>'id') ORDER BY random()), '[]'::jsonb)
        INTO _opt_ids
      FROM jsonb_array_elements(_opts) elem
      WHERE coalesce(elem->>'id', '') <> '';
    ELSE
      SELECT coalesce(jsonb_agg(to_jsonb(elem->>'id') ORDER BY ord), '[]'::jsonb)
        INTO _opt_ids
      FROM jsonb_array_elements(_opts) WITH ORDINALITY AS t(elem, ord)
      WHERE coalesce(elem->>'id', '') <> '';
    END IF;
    _order := _order || jsonb_build_object(_qid::text, _opt_ids);
  END LOOP;

  INSERT INTO public.training_progress (enrollment_id, lesson_id)
  VALUES (_enrollment_id, _lesson_id)
  ON CONFLICT (enrollment_id, lesson_id) DO NOTHING;

  UPDATE public.training_course_enrollments
  SET last_lesson_id = _lesson_id,
      started_at = COALESCE(started_at, now()),
      status = CASE WHEN status = 'ENROLLED' THEN 'IN_PROGRESS' ELSE status END
  WHERE id = _enrollment_id;

  INSERT INTO public.training_quiz_attempts (
    enrollment_id, lesson_id, staff_id, served_question_ids, option_order
  ) VALUES (
    _enrollment_id, _lesson_id, _staff, _ids, _order
  )
  RETURNING id INTO _attempt;

  RETURN jsonb_build_object(
    'attemptId', _attempt,
    'questions', public.training_quiz_public_questions(_ids, _order),
    'attemptsRemaining', GREATEST(_max - _submitted, 0),
    'submitted', false
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.training_quiz_submit(_attempt_id uuid, _answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _staff uuid := public.training_actor_staff_id();
  _owner uuid;
  _enrollment uuid;
  _lesson uuid;
  _version uuid;
  _served uuid[];
  _submitted timestamptz;
  _passing numeric;
  _max integer;
  _qid uuid;
  _kind text;
  _inner text;
  _points integer;
  _correct jsonb;
  _explanation text;
  _answer jsonb;
  _ok boolean;
  _earned integer := 0;
  _possible integer := 0;
  _score numeric := 0;
  _passed boolean := false;
  _explanations jsonb := '[]'::jsonb;
  _used integer := 0;
  _lesson_done boolean := false;
  _course boolean := false;
  _gated boolean := false;
  _required_open boolean := false;
  _lesson_count integer := 0;
  _completed timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _staff IS NULL THEN
    RAISE EXCEPTION 'no staff profile';
  END IF;
  IF _answers IS NULL OR jsonb_typeof(_answers) <> 'array' THEN
    RAISE EXCEPTION 'answers must be a list';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_answers) elem
    WHERE elem ? 'score' OR elem ? 'passed' OR elem ? 'clientScore'
  ) THEN
    RAISE EXCEPTION 'client score rejected';
  END IF;

  SELECT a.enrollment_id, a.lesson_id, a.staff_id, a.served_question_ids, a.submitted_at
    INTO _enrollment, _lesson, _owner, _served, _submitted
  FROM public.training_quiz_attempts a
  WHERE a.id = _attempt_id;
  IF _enrollment IS NULL THEN
    RAISE EXCEPTION 'attempt not found';
  END IF;
  IF _owner IS DISTINCT FROM _staff THEN
    RAISE EXCEPTION 'attempt belongs to another employee';
  END IF;
  IF _submitted IS NOT NULL THEN
    RAISE EXCEPTION 'attempt already submitted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_answers) elem
    WHERE NOT ((elem->>'questionId')::uuid = ANY (_served))
  ) THEN
    RAISE EXCEPTION 'answer is not for a served question';
  END IF;

  SELECT e.version_id INTO _version
  FROM public.training_course_enrollments e
  WHERE e.id = _enrollment
    AND e.staff_id = _staff;
  IF _version IS NULL THEN
    RAISE EXCEPTION 'attempt belongs to another employee';
  END IF;

  SELECT q.passing_score, q.max_attempts
    INTO _passing, _max
  FROM public.training_lesson_quizzes q
  WHERE q.lesson_id = _lesson;
  IF _max IS NULL THEN
    RAISE EXCEPTION 'quiz is not configured';
  END IF;

  FOREACH _qid IN ARRAY _served LOOP
    SELECT b.kind, b.inner_kind, b.points, k.correct, k.explanation
      INTO _kind, _inner, _points, _correct, _explanation
    FROM public.training_bank_questions b
    JOIN public.training_bank_question_keys k ON k.question_id = b.id
    WHERE b.id = _qid;

    _answer := NULL;
    SELECT elem INTO _answer
    FROM jsonb_array_elements(_answers) elem
    WHERE elem->>'questionId' = _qid::text
    LIMIT 1;

    _ok := public.training_grade_answer(_kind, _inner, _correct, COALESCE(_answer, '{}'::jsonb));
    _possible := _possible + coalesce(_points, 0);
    IF _ok THEN
      _earned := _earned + coalesce(_points, 0);
    END IF;
    _explanations := _explanations || jsonb_build_array(jsonb_build_object(
      'questionId', _qid,
      'explanation', _explanation,
      'wasCorrect', _ok
    ));
  END LOOP;

  IF _possible > 0 THEN
    _score := round((_earned::numeric / _possible::numeric) * 100);
  END IF;
  _passed := _score >= _passing;

  PERFORM set_config('training.authoritative_write', '1', true);
  UPDATE public.training_quiz_attempts
  SET answers = _answers,
      score = _score,
      passed = _passed,
      submitted_at = now()
  WHERE id = _attempt_id
    AND staff_id = _staff
    AND submitted_at IS NULL;

  IF _passed THEN
    INSERT INTO public.training_progress (enrollment_id, lesson_id)
    VALUES (_enrollment, _lesson)
    ON CONFLICT (enrollment_id, lesson_id) DO NOTHING;

    UPDATE public.training_progress
    SET completed_at = now()
    WHERE enrollment_id = _enrollment
      AND lesson_id = _lesson
      AND completed_at IS NULL
    RETURNING completed_at INTO _completed;

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
     AND p.enrollment_id = _enrollment
    WHERE s.version_id = _version;

    IF _lesson_count > 0 AND NOT _gated AND NOT _required_open THEN
      UPDATE public.training_course_enrollments
      SET status = 'COMPLETED',
          completed_at = COALESCE(completed_at, now())
      WHERE id = _enrollment
        AND completed_at IS NULL;
      IF FOUND THEN
        _course := true;
      END IF;
    END IF;
  END IF;

  SELECT p.completed_at IS NOT NULL INTO _lesson_done
  FROM public.training_progress p
  WHERE p.enrollment_id = _enrollment
    AND p.lesson_id = _lesson;

  SELECT count(*) INTO _used
  FROM public.training_quiz_attempts a
  WHERE a.enrollment_id = _enrollment
    AND a.lesson_id = _lesson
    AND a.submitted_at IS NOT NULL;

  RETURN jsonb_build_object(
    'score', _score,
    'passed', _passed,
    'attemptsRemaining', GREATEST(_max - _used, 0),
    'lessonCompleted', coalesce(_lesson_done, false),
    'courseCompleted', _course OR EXISTS (
      SELECT 1 FROM public.training_course_enrollments e
      WHERE e.id = _enrollment AND e.completed_at IS NOT NULL
    ),
    'explanations', _explanations
  );
END;
$fn$;

COMMENT ON FUNCTION public.training_quiz_start(uuid, uuid) IS
  'Draws a server-side subset for the signed-in staff enrollment. Does not return answer keys or explanations.';

COMMENT ON FUNCTION public.training_quiz_submit(uuid, jsonb) IS
  'Scores served answers on the server. Rejects a client score. Does not write enrollment.score and does not insert a certificate.';

REVOKE ALL ON FUNCTION public.training_tg_strip_question_flags() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_key_is_usable(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_grade_answer(text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_quiz_public_questions(uuid[], jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_quiz_start(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.training_quiz_submit(uuid, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.training_tg_strip_question_flags() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_quiz_start(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_quiz_submit(uuid, jsonb) TO authenticated, service_role;

GRANT SELECT ON public.training_question_banks TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.training_bank_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.training_bank_question_keys TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.training_lesson_quizzes TO authenticated;
GRANT SELECT ON public.training_quiz_attempts TO authenticated;
GRANT INSERT, UPDATE ON public.training_question_banks TO authenticated;

ALTER TABLE public.training_question_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_bank_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_bank_question_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_lesson_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_quiz_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY training_question_banks_select ON public.training_question_banks
  FOR SELECT TO authenticated
  USING (public.training_code_allows('training.assessment.manage'));

CREATE POLICY training_question_banks_write ON public.training_question_banks
  FOR INSERT TO authenticated
  WITH CHECK (public.training_code_allows('training.assessment.manage'));

CREATE POLICY training_question_banks_update ON public.training_question_banks
  FOR UPDATE TO authenticated
  USING (public.training_code_allows('training.assessment.manage'))
  WITH CHECK (public.training_code_allows('training.assessment.manage'));

CREATE POLICY training_bank_questions_select ON public.training_bank_questions
  FOR SELECT TO authenticated
  USING (
    public.training_code_allows('training.assessment.manage')
    OR id IN (
      SELECT unnest(a.served_question_ids)
      FROM public.training_quiz_attempts a
      WHERE a.staff_id = public.training_actor_staff_id()
    )
  );

CREATE POLICY training_bank_questions_write ON public.training_bank_questions
  FOR INSERT TO authenticated
  WITH CHECK (public.training_code_allows('training.assessment.manage'));

CREATE POLICY training_bank_questions_update ON public.training_bank_questions
  FOR UPDATE TO authenticated
  USING (public.training_code_allows('training.assessment.manage'))
  WITH CHECK (public.training_code_allows('training.assessment.manage'));

CREATE POLICY training_bank_question_keys_select ON public.training_bank_question_keys
  FOR SELECT TO authenticated
  USING (public.training_code_allows('training.assessment.manage'));

CREATE POLICY training_bank_question_keys_write ON public.training_bank_question_keys
  FOR INSERT TO authenticated
  WITH CHECK (public.training_code_allows('training.assessment.manage'));

CREATE POLICY training_bank_question_keys_update ON public.training_bank_question_keys
  FOR UPDATE TO authenticated
  USING (public.training_code_allows('training.assessment.manage'))
  WITH CHECK (public.training_code_allows('training.assessment.manage'));

CREATE POLICY training_lesson_quizzes_select ON public.training_lesson_quizzes
  FOR SELECT TO authenticated
  USING (public.training_code_allows('training.assessment.manage'));

CREATE POLICY training_lesson_quizzes_write ON public.training_lesson_quizzes
  FOR INSERT TO authenticated
  WITH CHECK (public.training_code_allows('training.assessment.manage'));

CREATE POLICY training_lesson_quizzes_update ON public.training_lesson_quizzes
  FOR UPDATE TO authenticated
  USING (public.training_code_allows('training.assessment.manage'))
  WITH CHECK (public.training_code_allows('training.assessment.manage'));

CREATE POLICY training_quiz_attempts_select ON public.training_quiz_attempts
  FOR SELECT TO authenticated
  USING (staff_id = public.training_actor_staff_id());
