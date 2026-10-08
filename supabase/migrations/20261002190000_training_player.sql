-- Player progress columns and the server event that writes them.
-- Learners still have no UPDATE on progress or enrollments.
-- This function does not accept a score and does not insert a certificate.

ALTER TABLE public.training_progress
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS time_spent_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;

ALTER TABLE public.training_progress
  DROP CONSTRAINT IF EXISTS training_progress_time_chk;
ALTER TABLE public.training_progress
  ADD CONSTRAINT training_progress_time_chk CHECK (time_spent_seconds >= 0);

ALTER TABLE public.training_progress
  DROP CONSTRAINT IF EXISTS training_progress_checklist_chk;
ALTER TABLE public.training_progress
  ADD CONSTRAINT training_progress_checklist_chk CHECK (jsonb_typeof(checklist) = 'array');

ALTER TABLE public.training_course_enrollments
  ADD COLUMN IF NOT EXISTS last_lesson_id uuid REFERENCES public.training_lessons(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.training_progress.time_spent_seconds IS
  'Sum of accepted heartbeats. A single request cannot add more than 30 seconds.';

COMMENT ON COLUMN public.training_course_enrollments.last_lesson_id IS
  'Last lesson the learner opened. Opening it does not complete the lesson.';

-- The flag still does nothing for authenticated or anon sessions.
-- A security definer function owned by the migration role may set it.
CREATE OR REPLACE FUNCTION public.training_authoritative()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT current_setting('training.authoritative_write', true) = '1'
    AND current_user NOT IN ('authenticated', 'anon', 'authenticator');
$$;

CREATE OR REPLACE FUNCTION public.training_player_event(
  _enrollment_id uuid,
  _lesson_id uuid,
  _event text,
  _delta_seconds integer,
  _position_seconds integer,
  _item_id text,
  _item_checked boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _staff uuid := public.training_actor_staff_id();
  _owner uuid;
  _version uuid;
  _kind text;
  _duration integer;
  _body text;
  _time integer := 0;
  _pos integer := 0;
  _completed timestamptz;
  _checklist jsonb := '[]'::jsonb;
  _ack timestamptz;
  _should boolean := false;
  _course boolean := false;
  _gated boolean := false;
  _required_open boolean := false;
  _lesson_count integer := 0;
  _valid_item boolean := false;
  _required_count integer := 0;
  _missing integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _staff IS NULL THEN
    RAISE EXCEPTION 'no staff profile';
  END IF;
  IF _event NOT IN ('VIEW', 'HEARTBEAT', 'MARK_READ', 'POSITION', 'CHECKLIST', 'ACKNOWLEDGE') THEN
    RAISE EXCEPTION 'unknown player event';
  END IF;

  SELECT e.staff_id, e.version_id
    INTO _owner, _version
  FROM public.training_course_enrollments e
  WHERE e.id = _enrollment_id;
  IF _owner IS NULL THEN
    RAISE EXCEPTION 'enrollment not found';
  END IF;
  IF _owner IS DISTINCT FROM _staff THEN
    RAISE EXCEPTION 'enrollment belongs to another employee';
  END IF;

  SELECT l.kind, l.duration_seconds, l.body
    INTO _kind, _duration, _body
  FROM public.training_lessons l
  JOIN public.training_sections s ON s.id = l.section_id
  WHERE l.id = _lesson_id
    AND s.version_id = _version;
  IF _kind IS NULL THEN
    RAISE EXCEPTION 'lesson not in enrollment';
  END IF;

  INSERT INTO public.training_progress (enrollment_id, lesson_id, position_seconds, time_spent_seconds, checklist)
  VALUES (_enrollment_id, _lesson_id, 0, 0, '[]'::jsonb)
  ON CONFLICT (enrollment_id, lesson_id) DO NOTHING;

  SELECT p.time_spent_seconds, p.position_seconds, p.completed_at, p.checklist, p.acknowledged_at
    INTO _time, _pos, _completed, _checklist, _ack
  FROM public.training_progress p
  WHERE p.enrollment_id = _enrollment_id
    AND p.lesson_id = _lesson_id
  FOR UPDATE;

  IF _event = 'VIEW' THEN
    UPDATE public.training_progress
    SET viewed_at = COALESCE(viewed_at, now())
    WHERE enrollment_id = _enrollment_id
      AND lesson_id = _lesson_id;
    UPDATE public.training_course_enrollments
    SET last_lesson_id = _lesson_id,
        started_at = COALESCE(started_at, now()),
        status = CASE WHEN status = 'ENROLLED' THEN 'IN_PROGRESS' ELSE status END
    WHERE id = _enrollment_id;
    _should := false;

  ELSIF _event = 'HEARTBEAT' THEN
    IF _delta_seconds IS NULL OR _delta_seconds <= 0 OR _delta_seconds > 30 THEN
      RAISE EXCEPTION 'heartbeat rejected';
    END IF;
    UPDATE public.training_progress
    SET time_spent_seconds = time_spent_seconds + _delta_seconds
    WHERE enrollment_id = _enrollment_id
      AND lesson_id = _lesson_id
    RETURNING time_spent_seconds INTO _time;

  ELSIF _event = 'MARK_READ' THEN
    IF _kind NOT IN ('TEXT', 'RICH_TEXT', 'IMAGE', 'EXTERNAL_LINK', 'PDF', 'DOCUMENT', 'PRESENTATION') THEN
      RAISE EXCEPTION 'lesson cannot be marked read';
    END IF;
    IF _time < 10 THEN
      RAISE EXCEPTION 'minimum time not reached';
    END IF;
    _should := true;

  ELSIF _event = 'POSITION' THEN
    IF _kind NOT IN ('VIDEO', 'AUDIO') THEN
      RAISE EXCEPTION 'position is only for media';
    END IF;
    IF _position_seconds IS NULL OR _position_seconds < 0 OR _position_seconds > _pos + 30 THEN
      RAISE EXCEPTION 'position jump rejected';
    END IF;
    UPDATE public.training_progress
    SET position_seconds = _position_seconds
    WHERE enrollment_id = _enrollment_id
      AND lesson_id = _lesson_id;
    _pos := _position_seconds;
    IF _duration IS NOT NULL AND _duration > 0 AND _position_seconds * 10 >= _duration * 9 THEN
      _should := true;
    END IF;

  ELSIF _event = 'CHECKLIST' THEN
    IF _kind <> 'CHECKLIST' THEN
      RAISE EXCEPTION 'lesson is not a checklist';
    END IF;
    IF _item_id IS NULL OR btrim(_item_id) = '' THEN
      RAISE EXCEPTION 'checklist item not found';
    END IF;
    SELECT EXISTS (
      SELECT 1
      FROM regexp_split_to_table(coalesce(_body, ''), E'\n') AS line
      WHERE btrim(line) = btrim(_item_id)
        AND btrim(line) <> ''
    ) INTO _valid_item;
    IF NOT _valid_item AND left(btrim(coalesce(_body, '')), 1) = '[' THEN
      SELECT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(_body::jsonb) AS elem
        WHERE elem #>> '{}' = btrim(_item_id)
           OR elem->>'id' = btrim(_item_id)
           OR elem->>'label' = btrim(_item_id)
      ) INTO _valid_item;
    END IF;
    IF NOT _valid_item THEN
      RAISE EXCEPTION 'checklist item not found';
    END IF;
    IF coalesce(_item_checked, false) THEN
      IF NOT (_checklist @> to_jsonb(btrim(_item_id))) THEN
        _checklist := _checklist || to_jsonb(btrim(_item_id));
      END IF;
    ELSE
      SELECT coalesce(jsonb_agg(elem), '[]'::jsonb)
        INTO _checklist
      FROM jsonb_array_elements(_checklist) AS elem
      WHERE elem <> to_jsonb(btrim(_item_id));
    END IF;
    UPDATE public.training_progress
    SET checklist = _checklist
    WHERE enrollment_id = _enrollment_id
      AND lesson_id = _lesson_id;

    IF left(btrim(coalesce(_body, '')), 1) = '[' THEN
      SELECT count(*) INTO _required_count
      FROM jsonb_array_elements(_body::jsonb) AS elem
      WHERE coalesce(elem->>'required', 'true') <> 'false'
        AND coalesce(elem->>'id', elem->>'label', elem #>> '{}') IS NOT NULL;
      SELECT count(*) INTO _missing
      FROM jsonb_array_elements(_body::jsonb) AS elem
      WHERE coalesce(elem->>'required', 'true') <> 'false'
        AND NOT (_checklist @> to_jsonb(coalesce(elem->>'id', elem->>'label', elem #>> '{}')));
    ELSE
      SELECT count(*) INTO _required_count
      FROM regexp_split_to_table(coalesce(_body, ''), E'\n') AS line
      WHERE btrim(line) <> '';
      SELECT count(*) INTO _missing
      FROM regexp_split_to_table(coalesce(_body, ''), E'\n') AS line
      WHERE btrim(line) <> ''
        AND NOT (_checklist @> to_jsonb(btrim(line)));
    END IF;
    IF _required_count > 0 AND _missing = 0 THEN
      _should := true;
    END IF;

  ELSIF _event = 'ACKNOWLEDGE' THEN
    IF _kind <> 'ACKNOWLEDGEMENT' THEN
      RAISE EXCEPTION 'lesson is not an acknowledgement';
    END IF;
    UPDATE public.training_progress
    SET acknowledged_at = COALESCE(acknowledged_at, now())
    WHERE enrollment_id = _enrollment_id
      AND lesson_id = _lesson_id
    RETURNING acknowledged_at INTO _ack;
    _should := true;
  END IF;

  IF _kind IN ('QUIZ', 'ASSESSMENT', 'ASSIGNMENT', 'PRACTICAL_ASSESSMENT') THEN
    _should := false;
    IF _event IN ('MARK_READ', 'POSITION', 'CHECKLIST', 'ACKNOWLEDGE') THEN
      RAISE EXCEPTION 'lesson is not finishable in this phase';
    END IF;
  END IF;

  IF _should AND _completed IS NULL THEN
    PERFORM set_config('training.authoritative_write', '1', true);
    UPDATE public.training_progress
    SET completed_at = now()
    WHERE enrollment_id = _enrollment_id
      AND lesson_id = _lesson_id
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
     AND p.enrollment_id = _enrollment_id
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

  RETURN jsonb_build_object(
    'timeSpentSeconds', _time,
    'positionSeconds', _pos,
    'lessonCompleted', _completed IS NOT NULL,
    'courseCompleted', _course,
    'checklist', _checklist,
    'acknowledged', _ack IS NOT NULL
  );
END;
$$;

COMMENT ON FUNCTION public.training_player_event(uuid, uuid, text, integer, integer, text, boolean) IS
  'Writes view, heartbeat, read, media position, checklist, or acknowledgement for the signed-in staff enrollment. Does not accept or write a score. Does not insert a certificate. Quiz, assessment, assignment, and practical lessons stay unfinished.';

REVOKE ALL ON FUNCTION public.training_player_event(uuid, uuid, text, integer, integer, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.training_player_event(uuid, uuid, text, integer, integer, text, boolean) TO authenticated, service_role;
