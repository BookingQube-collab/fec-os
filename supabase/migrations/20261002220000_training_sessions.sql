-- Classroom sessions and attendance.
-- A course requires attendance only when requires_session_attendance is on.
-- Present or Late can satisfy that gate. Attendance never writes a score
-- and never inserts a certificate. Participants are a roster, not enrollments.
-- Legacy training_enrollments and complete_training are not used.

ALTER TABLE public.training_courses
  ADD COLUMN IF NOT EXISTS requires_session_attendance boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.training_courses.requires_session_attendance IS
  'When true, Present or Late on a session for this course is required before completion. Default false so existing courses stay open.';

ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS room text;

COMMENT ON COLUMN public.training_sessions.room IS
  'Optional room or place label. The site is location_id.';

ALTER TABLE public.training_attendance
  DROP CONSTRAINT IF EXISTS training_attendance_status_chk;

ALTER TABLE public.training_attendance
  ADD CONSTRAINT training_attendance_status_chk
  CHECK (status IN ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED'));

CREATE TABLE IF NOT EXISTS public.training_session_participants (
  session_id uuid NOT NULL REFERENCES public.training_sessions(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  added_by uuid NOT NULL REFERENCES auth.users(id),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, staff_id)
);

CREATE INDEX IF NOT EXISTS training_session_participants_staff_idx
  ON public.training_session_participants (staff_id);

CREATE INDEX IF NOT EXISTS training_sessions_trainer_idx
  ON public.training_sessions (trainer_staff_id, starts_at);

COMMENT ON TABLE public.training_session_participants IS
  'Roster for one session. This is not a course enrollment and does not complete a course.';

CREATE OR REPLACE FUNCTION public.training_attendance_blocks_completion(_enrollment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT COALESCE((
    SELECT c.requires_session_attendance
      AND NOT EXISTS (
        SELECT 1
        FROM public.training_session_participants p
        JOIN public.training_sessions s
          ON s.id = p.session_id
         AND s.course_id = e.course_id
         AND s.status <> 'CANCELLED'
        JOIN public.training_attendance a
          ON a.session_id = s.id
         AND a.staff_id = e.staff_id
         AND a.status IN ('PRESENT', 'LATE')
        WHERE p.staff_id = e.staff_id
      )
    FROM public.training_course_enrollments e
    JOIN public.training_courses c ON c.id = e.course_id
    WHERE e.id = _enrollment_id
  ), false);
$fn$;

COMMENT ON FUNCTION public.training_attendance_blocks_completion(uuid) IS
  'True only when the course requires session attendance and the learner has no Present or Late mark. Does not write a score or a certificate.';

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
    RETURN FOUND;
  END IF;
  RETURN false;
END;
$fn$;

COMMENT ON FUNCTION public.training_try_complete_enrollment(uuid) IS
  'Completes an enrollment only when required lessons and open gates are done. Honors the attendance flag. Does not set a score and does not insert a certificate.';

CREATE OR REPLACE FUNCTION public.training_tg_completion_attendance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.completed_at IS NOT NULL
    AND OLD.completed_at IS NULL
    AND public.training_attendance_blocks_completion(NEW.id)
  THEN
    NEW.completed_at := NULL;
    NEW.status := OLD.status;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_training_completion_attendance ON public.training_course_enrollments;
CREATE TRIGGER trg_training_completion_attendance
  BEFORE UPDATE ON public.training_course_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.training_tg_completion_attendance();

CREATE OR REPLACE FUNCTION public.training_tg_session_published()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.training_course_versions v
    WHERE v.id = NEW.version_id
      AND v.course_id = NEW.course_id
      AND v.status = 'PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'session requires a published course version';
  END IF;
  IF NEW.capacity IS NULL OR NEW.capacity < 1 THEN
    RAISE EXCEPTION 'capacity must be at least 1';
  END IF;
  IF NEW.trainer_staff_id IS NULL THEN
    RAISE EXCEPTION 'trainer is required';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.user_can_access_staff(NEW.trainer_staff_id) THEN
    RAISE EXCEPTION 'trainer is outside staff scope';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.user_can_access_location(NEW.location_id) THEN
    RAISE EXCEPTION 'location is outside site scope';
  END IF;
  IF NEW.room IS NOT NULL AND char_length(btrim(NEW.room)) > 80 THEN
    RAISE EXCEPTION 'room label is too long';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_training_session_published ON public.training_sessions;
CREATE TRIGGER trg_training_session_published
  BEFORE INSERT OR UPDATE ON public.training_sessions
  FOR EACH ROW EXECUTE FUNCTION public.training_tg_session_published();

CREATE OR REPLACE FUNCTION public.training_tg_session_capacity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  _capacity integer;
  _count integer;
BEGIN
  SELECT capacity INTO _capacity
  FROM public.training_sessions
  WHERE id = NEW.session_id;
  SELECT count(*) INTO _count
  FROM public.training_session_participants
  WHERE session_id = NEW.session_id;
  IF _capacity IS NULL OR _count >= _capacity THEN
    RAISE EXCEPTION 'capacity exceeded';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_training_session_capacity ON public.training_session_participants;
CREATE TRIGGER trg_training_session_capacity
  BEFORE INSERT ON public.training_session_participants
  FOR EACH ROW EXECUTE FUNCTION public.training_tg_session_capacity();

CREATE OR REPLACE FUNCTION public.training_session_visible(
  _location_id uuid,
  _trainer_staff_id uuid,
  _session_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT
    (
      public.training_code_allows('training.view')
      AND public.user_can_access_location(_location_id)
    )
    OR _trainer_staff_id = public.training_actor_staff_id()
    OR EXISTS (
      SELECT 1
      FROM public.training_session_participants p
      WHERE p.session_id = _session_id
        AND p.staff_id = public.training_actor_staff_id()
    );
$fn$;

CREATE OR REPLACE FUNCTION public.training_session_create(
  _version_id uuid,
  _trainer_staff_id uuid,
  _location_id uuid,
  _room text,
  _starts_at timestamptz,
  _ends_at timestamptz,
  _capacity integer,
  _participants uuid[]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _course uuid;
  _session uuid;
  _person uuid;
  _count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.training_code_allows('training.session.create') THEN
    RAISE EXCEPTION 'training.session.create required';
  END IF;
  IF _starts_at IS NULL OR _ends_at IS NULL OR _ends_at <= _starts_at THEN
    RAISE EXCEPTION 'end time must be after the start time';
  END IF;
  IF _capacity IS NULL OR _capacity < 1 OR _capacity > 500 THEN
    RAISE EXCEPTION 'capacity must be at least 1';
  END IF;

  SELECT v.course_id INTO _course
  FROM public.training_course_versions v
  WHERE v.id = _version_id
    AND v.status = 'PUBLISHED';
  IF _course IS NULL THEN
    RAISE EXCEPTION 'session requires a published course version';
  END IF;
  IF NOT public.user_can_access_location(_location_id) THEN
    RAISE EXCEPTION 'location is outside site scope';
  END IF;
  IF NOT public.user_can_access_staff(_trainer_staff_id) THEN
    RAISE EXCEPTION 'trainer is outside staff scope';
  END IF;

  SELECT count(*) INTO _count
  FROM (SELECT DISTINCT person FROM unnest(coalesce(_participants, ARRAY[]::uuid[])) AS u(person)) d;
  IF _count < coalesce(array_length(_participants, 1), 0) THEN
    RAISE EXCEPTION 'participant is listed twice';
  END IF;
  IF _count > _capacity THEN
    RAISE EXCEPTION 'capacity exceeded';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(coalesce(_participants, ARRAY[]::uuid[])) AS u(pid)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.id = u.pid
        AND s.deleted_at IS NULL
        AND public.user_can_access_staff(s.id)
    )
  ) THEN
    RAISE EXCEPTION 'participant is outside staff scope';
  END IF;

  INSERT INTO public.training_sessions (
    course_id, version_id, location_id, trainer_staff_id, starts_at, ends_at, capacity, room, status, created_by
  ) VALUES (
    _course,
    _version_id,
    _location_id,
    _trainer_staff_id,
    _starts_at,
    _ends_at,
    _capacity,
    nullif(btrim(coalesce(_room, '')), ''),
    'SCHEDULED',
    auth.uid()
  )
  RETURNING id INTO _session;

  FOREACH _person IN ARRAY coalesce(_participants, ARRAY[]::uuid[]) LOOP
    INSERT INTO public.training_session_participants (session_id, staff_id, added_by)
    VALUES (_session, _person, auth.uid());
  END LOOP;

  RETURN _session;
END;
$fn$;

COMMENT ON FUNCTION public.training_session_create(uuid, uuid, uuid, text, timestamptz, timestamptz, integer, uuid[]) IS
  'Creates a session on a published version for in-scope staff. Does not create a course enrollment, does not set a score, and does not insert a certificate.';

CREATE OR REPLACE FUNCTION public.training_session_mark_attendance(
  _session_id uuid,
  _staff_id uuid,
  _status text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _actor uuid := public.training_actor_staff_id();
  _trainer uuid;
  _course uuid;
  _completed boolean := false;
  _enrollment uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.training_code_allows('training.attendance.manage') THEN
    RAISE EXCEPTION 'training.attendance.manage required';
  END IF;
  IF _status NOT IN ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED') THEN
    RAISE EXCEPTION 'attendance status is not allowed';
  END IF;
  IF _actor IS NOT NULL AND _actor = _staff_id THEN
    RAISE EXCEPTION 'learner cannot mark their own attendance';
  END IF;

  SELECT s.trainer_staff_id, s.course_id
    INTO _trainer, _course
  FROM public.training_sessions s
  WHERE s.id = _session_id;
  IF _course IS NULL THEN
    RAISE EXCEPTION 'session not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.training_session_participants p
    WHERE p.session_id = _session_id
      AND p.staff_id = _staff_id
  ) THEN
    RAISE EXCEPTION 'person is not on this session';
  END IF;

  IF _actor IS DISTINCT FROM _trainer AND NOT (
    public.training_code_allows('training.session.create')
    AND public.user_can_access_staff(_staff_id)
  ) THEN
    RAISE EXCEPTION 'attendance is outside your scope';
  END IF;

  INSERT INTO public.training_attendance (session_id, staff_id, status, marked_by, marked_at)
  VALUES (_session_id, _staff_id, _status, auth.uid(), now())
  ON CONFLICT (session_id, staff_id) DO UPDATE
  SET status = EXCLUDED.status,
      marked_by = EXCLUDED.marked_by,
      marked_at = EXCLUDED.marked_at;

  IF _status IN ('PRESENT', 'LATE') THEN
    SELECT e.id INTO _enrollment
    FROM public.training_course_enrollments e
    JOIN public.training_courses c ON c.id = e.course_id
    WHERE e.staff_id = _staff_id
      AND e.course_id = _course
      AND e.completed_at IS NULL
      AND c.requires_session_attendance
    ORDER BY e.enrolled_at
    LIMIT 1;
    IF _enrollment IS NOT NULL AND public.training_try_complete_enrollment(_enrollment) THEN
      _completed := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status', _status,
    'markedAt', now(),
    'courseCompleted', _completed
  );
END;
$fn$;

COMMENT ON FUNCTION public.training_session_mark_attendance(uuid, uuid, text) IS
  'Records Present, Absent, Late, or Excused. A learner cannot mark themselves. Present or Late may complete a course only when that course requires attendance and every other gate is already done. Does not set a score and does not insert a certificate.';

CREATE OR REPLACE FUNCTION public.training_session_staff_page(
  _query text,
  _limit integer,
  _offset integer
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _rows jsonb := '[]'::jsonb;
  _total integer := 0;
  _q text := btrim(coalesce(_query, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT (
    public.training_code_allows('training.session.create')
    OR public.training_code_allows('training.view')
  ) THEN
    RAISE EXCEPTION 'training.session.create required';
  END IF;
  IF _limit IS NULL OR _limit < 1 OR _limit > 20 OR _offset IS NULL OR _offset < 0 THEN
    RAISE EXCEPTION 'page is out of range';
  END IF;
  IF char_length(_q) < 1 THEN
    RETURN jsonb_build_object('total', 0, 'rows', '[]'::jsonb);
  END IF;

  SELECT count(*) INTO _total
  FROM public.staff s
  WHERE s.deleted_at IS NULL
    AND public.user_can_access_staff(s.id)
    AND (
      s.full_name ILIKE '%' || _q || '%'
      OR s.employee_code ILIKE '%' || _q || '%'
    );

  SELECT coalesce(jsonb_agg(row_to_json(q)::jsonb), '[]'::jsonb) INTO _rows
  FROM (
    SELECT s.id, s.full_name AS "fullName", s.employee_code AS "employeeCode"
    FROM public.staff s
    WHERE s.deleted_at IS NULL
      AND public.user_can_access_staff(s.id)
      AND (
        s.full_name ILIKE '%' || _q || '%'
        OR s.employee_code ILIKE '%' || _q || '%'
      )
    ORDER BY s.full_name
    LIMIT _limit OFFSET _offset
  ) q;

  RETURN jsonb_build_object('total', _total, 'rows', _rows);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.training_session_calendar(
  _from timestamptz,
  _to timestamptz,
  _location_id uuid,
  _trainer_staff_id uuid,
  _course_id uuid,
  _department_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _actor uuid := public.training_actor_staff_id();
  _sessions jsonb := '[]'::jsonb;
  _due jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT (
    public.training_code_allows('training.view')
    OR public.training_code_allows('training.session.create')
    OR public.training_code_allows('training.learn')
  ) THEN
    RAISE EXCEPTION 'training calendar access required';
  END IF;
  IF _from IS NULL OR _to IS NULL OR _to <= _from OR _to > _from + interval '62 days' THEN
    RAISE EXCEPTION 'calendar range is out of bounds';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(q)::jsonb), '[]'::jsonb) INTO _sessions
  FROM (
    SELECT
      s.id,
      c.title AS "courseTitle",
      c.code AS "courseCode",
      s.course_id AS "courseId",
      s.starts_at AS "startsAt",
      s.ends_at AS "endsAt",
      s.room,
      s.location_id AS "locationId",
      l.name AS "locationName",
      s.trainer_staff_id AS "trainerStaffId",
      tr.full_name AS "trainerName",
      s.capacity,
      (
        SELECT count(*)
        FROM public.training_session_participants p
        WHERE p.session_id = s.id
      ) AS "participantCount"
    FROM public.training_sessions s
    JOIN public.training_courses c ON c.id = s.course_id
    JOIN public.locations l ON l.id = s.location_id
    LEFT JOIN public.staff tr ON tr.id = s.trainer_staff_id
    WHERE s.status <> 'CANCELLED'
      AND s.starts_at < _to
      AND s.ends_at > _from
      AND public.training_session_visible(s.location_id, s.trainer_staff_id, s.id)
      AND (_location_id IS NULL OR s.location_id = _location_id)
      AND (_trainer_staff_id IS NULL OR s.trainer_staff_id = _trainer_staff_id)
      AND (_course_id IS NULL OR s.course_id = _course_id)
      AND (
        _department_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.staff_departments sd
          WHERE sd.department_id = _department_id
            AND (
              sd.staff_id = s.trainer_staff_id
              OR EXISTS (
                SELECT 1
                FROM public.training_session_participants p
                WHERE p.session_id = s.id
                  AND p.staff_id = sd.staff_id
              )
            )
        )
      )
    ORDER BY s.starts_at
    LIMIT 200
  ) q;

  SELECT coalesce(jsonb_agg(row_to_json(q)::jsonb), '[]'::jsonb) INTO _due
  FROM (
    SELECT
      e.id AS "enrollmentId",
      c.title AS "courseTitle",
      e.due_on AS "dueOn"
    FROM public.training_course_enrollments e
    JOIN public.training_courses c ON c.id = e.course_id
    LEFT JOIN public.training_assignments a ON a.id = e.assignment_id
    WHERE _actor IS NOT NULL
      AND e.staff_id = _actor
      AND e.completed_at IS NULL
      AND e.due_on IS NOT NULL
      AND e.due_on >= _from::date
      AND e.due_on <= _to::date
      AND coalesce(a.required, false)
    ORDER BY e.due_on
    LIMIT 100
  ) q;

  RETURN jsonb_build_object('sessions', _sessions, 'dueDates', _due);
END;
$fn$;

COMMENT ON FUNCTION public.training_session_calendar(timestamptz, timestamptz, uuid, uuid, uuid, uuid) IS
  'Sessions the caller may see, plus that caller''s own mandatory due dates. Does not list certificate expiry or another site''s sessions.';

CREATE OR REPLACE FUNCTION public.training_session_detail(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _actor uuid := public.training_actor_staff_id();
  _row public.training_sessions%ROWTYPE;
  _participants jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  SELECT * INTO _row FROM public.training_sessions WHERE id = _session_id;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'session not found';
  END IF;
  IF NOT public.training_session_visible(_row.location_id, _row.trainer_staff_id, _row.id) THEN
    RAISE EXCEPTION 'session is outside your scope';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(q)::jsonb), '[]'::jsonb) INTO _participants
  FROM (
    SELECT
      p.staff_id AS "staffId",
      s.full_name AS "staffName",
      s.employee_code AS "employeeCode",
      a.status AS "attendance",
      a.marked_at AS "markedAt",
      marker.full_name AS "markedByName",
      (
        public.training_code_allows('training.attendance.manage')
        AND p.staff_id IS DISTINCT FROM _actor
        AND (
          _row.trainer_staff_id = _actor
          OR (
            public.training_code_allows('training.session.create')
            AND public.user_can_access_staff(p.staff_id)
          )
        )
      ) AS "canMark"
    FROM public.training_session_participants p
    JOIN public.staff s ON s.id = p.staff_id
    LEFT JOIN public.training_attendance a
      ON a.session_id = p.session_id
     AND a.staff_id = p.staff_id
    LEFT JOIN public.staff marker ON marker.user_id = a.marked_by
    WHERE p.session_id = _session_id
    ORDER BY s.full_name
  ) q;

  RETURN jsonb_build_object(
    'id', _row.id,
    'courseTitle', (SELECT title FROM public.training_courses WHERE id = _row.course_id),
    'courseCode', (SELECT code FROM public.training_courses WHERE id = _row.course_id),
    'startsAt', _row.starts_at,
    'endsAt', _row.ends_at,
    'room', _row.room,
    'capacity', _row.capacity,
    'status', _row.status,
    'locationName', (SELECT name FROM public.locations WHERE id = _row.location_id),
    'trainerName', (SELECT full_name FROM public.staff WHERE id = _row.trainer_staff_id),
    'participants', _participants
  );
END;
$fn$;

DROP POLICY IF EXISTS training_sessions_select ON public.training_sessions;
CREATE POLICY training_sessions_select ON public.training_sessions
  FOR SELECT TO authenticated
  USING (
    (
      public.training_code_allows('training.view')
      AND public.user_can_access_location(location_id)
    )
    OR trainer_staff_id = public.training_actor_staff_id()
    OR EXISTS (
      SELECT 1
      FROM public.training_session_participants p
      WHERE p.session_id = training_sessions.id
        AND p.staff_id = public.training_actor_staff_id()
    )
  );

DROP POLICY IF EXISTS training_attendance_insert ON public.training_attendance;
CREATE POLICY training_attendance_insert ON public.training_attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    public.training_code_allows('training.attendance.manage')
    AND marked_by = auth.uid()
    AND staff_id IS DISTINCT FROM public.training_actor_staff_id()
    AND public.user_can_access_staff(staff_id)
    AND EXISTS (
      SELECT 1
      FROM public.training_sessions s
      WHERE s.id = session_id
        AND (
          s.trainer_staff_id = public.training_actor_staff_id()
          OR public.training_code_allows('training.session.create')
        )
    )
  );

ALTER TABLE public.training_session_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_session_participants_select ON public.training_session_participants;
CREATE POLICY training_session_participants_select ON public.training_session_participants
  FOR SELECT TO authenticated
  USING (
    staff_id = public.training_actor_staff_id()
    OR EXISTS (
      SELECT 1
      FROM public.training_sessions s
      WHERE s.id = training_session_participants.session_id
        AND (
          s.trainer_staff_id = public.training_actor_staff_id()
          OR (
            public.training_code_allows('training.view')
            AND public.user_can_access_location(s.location_id)
          )
        )
    )
  );

REVOKE ALL ON public.training_session_participants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.training_session_participants TO authenticated;
GRANT ALL ON public.training_session_participants TO service_role;

REVOKE ALL ON FUNCTION public.training_attendance_blocks_completion(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_try_complete_enrollment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_tg_completion_attendance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_tg_session_published() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_tg_session_capacity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_session_visible(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_session_create(uuid, uuid, uuid, text, timestamptz, timestamptz, integer, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.training_session_mark_attendance(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.training_session_staff_page(text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.training_session_calendar(timestamptz, timestamptz, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.training_session_detail(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.training_tg_completion_attendance() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_tg_session_published() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_tg_session_capacity() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_session_create(uuid, uuid, uuid, text, timestamptz, timestamptz, integer, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_session_mark_attendance(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_session_staff_page(text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_session_calendar(timestamptz, timestamptz, uuid, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_session_detail(uuid) TO authenticated, service_role;

-- Lesson completion also honors the attendance flag.
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

    IF _lesson_count > 0 AND NOT _gated AND NOT _required_open AND NOT public.training_attendance_blocks_completion(_enrollment_id) THEN
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

    IF _lesson_count > 0 AND NOT _gated AND NOT _required_open AND NOT public.training_attendance_blocks_completion(_enrollment) THEN
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

    IF _lesson_count > 0 AND NOT _gated AND NOT _required_open AND NOT public.training_attendance_blocks_completion(_enrollment_id) THEN
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
