-- Phase 4 assignment metadata and enrollment expansion.
-- Reminder day offsets are stored only. Nothing dispatches them.
-- training_saved_rules are stored only. No staff trigger executes them.
-- BUSINESS_UNIT, TEAM, and CUSTOM do not expand into employees. There is no master list for those labels.
-- Enrollment inserts go through training_apply_assignment. Authenticated users still have no INSERT on training_course_enrollments.
-- The function never writes status COMPLETED, completed_at, or score.

ALTER TABLE public.training_assignments
  ADD COLUMN IF NOT EXISTS version_id uuid REFERENCES public.training_course_versions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS start_on date,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS reminder_offsets_days integer[] NOT NULL DEFAULT '{}';

ALTER TABLE public.training_assignments
  DROP CONSTRAINT IF EXISTS training_assignments_priority_chk;
ALTER TABLE public.training_assignments
  ADD CONSTRAINT training_assignments_priority_chk
  CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT'));

ALTER TABLE public.training_assignments
  DROP CONSTRAINT IF EXISTS training_assignments_reason_chk;
ALTER TABLE public.training_assignments
  ADD CONSTRAINT training_assignments_reason_chk
  CHECK (reason IS NULL OR char_length(reason) <= 2000);

ALTER TABLE public.training_assignments
  DROP CONSTRAINT IF EXISTS training_assignments_reminders_chk;
ALTER TABLE public.training_assignments
  ADD CONSTRAINT training_assignments_reminders_chk
  CHECK (
    cardinality(reminder_offsets_days) <= 8
    AND reminder_offsets_days <@ ARRAY[0, 1, 2, 3, 7, 14, 21, 30, 60, 90]::integer[]
  );

CREATE OR REPLACE FUNCTION public.training_tg_assignment_published()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.course_id IS NULL OR NEW.version_id IS NULL THEN
    RAISE EXCEPTION 'only a published course version can be assigned';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.training_course_versions v
    JOIN public.training_courses c ON c.id = v.course_id
    WHERE v.id = NEW.version_id
      AND v.course_id = NEW.course_id
      AND v.status = 'PUBLISHED'
      AND c.status = 'PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'only a published course version can be assigned';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_training_assignment_published ON public.training_assignments;
CREATE TRIGGER trg_training_assignment_published
  BEFORE INSERT OR UPDATE OF course_id, version_id ON public.training_assignments
  FOR EACH ROW EXECUTE FUNCTION public.training_tg_assignment_published();

CREATE TABLE IF NOT EXISTS public.training_saved_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.training_courses(id) ON DELETE RESTRICT,
  version_id uuid NOT NULL REFERENCES public.training_course_versions(id) ON DELETE RESTRICT,
  trigger_kind text NOT NULL,
  target text NOT NULL,
  staff_id uuid REFERENCES public.staff(id) ON DELETE RESTRICT,
  department_id uuid REFERENCES public.master_departments(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT,
  role_code text,
  business_unit text,
  team_label text,
  employment_type text,
  custom_label text,
  required boolean NOT NULL DEFAULT true,
  priority text NOT NULL DEFAULT 'NORMAL',
  due_offset_days integer,
  reminder_offsets_days integer[] NOT NULL DEFAULT '{}',
  reason text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_saved_rules_trigger_chk CHECK (
    trigger_kind IN ('JOIN_COMPANY', 'ROLE_CHANGE', 'MACHINE_ASSIGNMENT')
  ),
  CONSTRAINT training_saved_rules_priority_chk CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  CONSTRAINT training_saved_rules_target_chk CHECK (target IN (
    'EMPLOYEE', 'DEPARTMENT', 'ROLE', 'SITE', 'BUSINESS_UNIT', 'TEAM', 'EMPLOYEE_TYPE', 'CUSTOM', 'COMPANY'
  )),
  CONSTRAINT training_saved_rules_shape_chk CHECK (
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

COMMENT ON TABLE public.training_saved_rules IS
  'Reusable assignment rules. Stored only. No job and no staff trigger executes them.';

DROP TRIGGER IF EXISTS trg_training_saved_rules_published ON public.training_saved_rules;
CREATE TRIGGER trg_training_saved_rules_published
  BEFORE INSERT OR UPDATE OF course_id, version_id ON public.training_saved_rules
  FOR EACH ROW EXECUTE FUNCTION public.training_tg_assignment_published();

ALTER TABLE public.training_saved_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_saved_rules_select ON public.training_saved_rules;
CREATE POLICY training_saved_rules_select ON public.training_saved_rules
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

DROP POLICY IF EXISTS training_saved_rules_insert ON public.training_saved_rules;
CREATE POLICY training_saved_rules_insert ON public.training_saved_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
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
    )
  );

REVOKE ALL ON public.training_saved_rules FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.training_saved_rules TO authenticated;
GRANT ALL ON public.training_saved_rules TO service_role;

CREATE OR REPLACE FUNCTION public.training_apply_assignment(_assignment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _course uuid;
  _version uuid;
  _due date;
  _inserted integer := 0;
  _count integer := 0;
  _rule record;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.training_code_allows('training.assign') THEN
    RAISE EXCEPTION 'training.assign required';
  END IF;

  SELECT a.course_id, a.version_id, a.due_on
    INTO _course, _version, _due
  FROM public.training_assignments a
  WHERE a.id = _assignment_id
    AND a.created_by = _actor;

  IF _course IS NULL OR _version IS NULL THEN
    RAISE EXCEPTION 'assignment not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.training_course_versions v
    JOIN public.training_courses c ON c.id = v.course_id
    WHERE v.id = _version
      AND c.id = _course
      AND v.status = 'PUBLISHED'
      AND c.status = 'PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'only a published course version can be assigned';
  END IF;

  FOR _rule IN
    SELECT *
    FROM public.training_assignment_rules r
    WHERE r.assignment_id = _assignment_id
  LOOP
    IF _rule.target = 'COMPANY' THEN
      IF NOT public.training_code_allows('training.assign.company') THEN
        RAISE EXCEPTION 'training.assign.company required';
      END IF;
      INSERT INTO public.training_course_enrollments (
        staff_id, course_id, version_id, assignment_id, status, due_on
      )
      SELECT s.id, _course, _version, _assignment_id, 'ENROLLED', _due
      FROM public.staff s
      WHERE s.deleted_at IS NULL
        AND s.status = 'active'
      ON CONFLICT (staff_id, version_id) DO NOTHING;
      GET DIAGNOSTICS _count = ROW_COUNT;
      _inserted := _inserted + _count;

    ELSIF _rule.target = 'SITE' THEN
      IF NOT public.training_code_allows('training.assign.site') THEN
        RAISE EXCEPTION 'training.assign.site required';
      END IF;
      IF NOT public.user_can_access_location(_rule.location_id) THEN
        RAISE EXCEPTION 'site is outside your scope';
      END IF;
      INSERT INTO public.training_course_enrollments (
        staff_id, course_id, version_id, assignment_id, status, due_on
      )
      SELECT s.id, _course, _version, _assignment_id, 'ENROLLED', _due
      FROM public.staff s
      WHERE s.deleted_at IS NULL
        AND s.status = 'active'
        AND s.location_id = _rule.location_id
        AND public.user_can_access_staff(s.id)
      ON CONFLICT (staff_id, version_id) DO NOTHING;
      GET DIAGNOSTICS _count = ROW_COUNT;
      _inserted := _inserted + _count;

    ELSIF _rule.target = 'DEPARTMENT' THEN
      IF NOT public.training_code_allows('training.assign.department') THEN
        RAISE EXCEPTION 'training.assign.department required';
      END IF;
      INSERT INTO public.training_course_enrollments (
        staff_id, course_id, version_id, assignment_id, status, due_on
      )
      SELECT s.id, _course, _version, _assignment_id, 'ENROLLED', _due
      FROM public.staff s
      JOIN public.staff_departments sd ON sd.staff_id = s.id
      WHERE sd.department_id = _rule.department_id
        AND s.deleted_at IS NULL
        AND s.status = 'active'
        AND public.user_can_access_staff(s.id)
      ON CONFLICT (staff_id, version_id) DO NOTHING;
      GET DIAGNOSTICS _count = ROW_COUNT;
      _inserted := _inserted + _count;

    ELSIF _rule.target = 'EMPLOYEE' THEN
      IF NOT public.user_can_access_staff(_rule.staff_id) THEN
        RAISE EXCEPTION 'employee is outside your scope';
      END IF;
      INSERT INTO public.training_course_enrollments (
        staff_id, course_id, version_id, assignment_id, status, due_on
      )
      SELECT s.id, _course, _version, _assignment_id, 'ENROLLED', _due
      FROM public.staff s
      WHERE s.id = _rule.staff_id
        AND s.deleted_at IS NULL
      ON CONFLICT (staff_id, version_id) DO NOTHING;
      GET DIAGNOSTICS _count = ROW_COUNT;
      _inserted := _inserted + _count;

    ELSIF _rule.target = 'ROLE' THEN
      INSERT INTO public.training_course_enrollments (
        staff_id, course_id, version_id, assignment_id, status, due_on
      )
      SELECT s.id, _course, _version, _assignment_id, 'ENROLLED', _due
      FROM public.staff s
      WHERE s.deleted_at IS NULL
        AND s.status = 'active'
        AND public.user_can_access_staff(s.id)
        AND (
          s.staff_role::text = _rule.role_code
          OR EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.user_id = s.user_id
              AND ur.role::text = _rule.role_code
          )
        )
      ON CONFLICT (staff_id, version_id) DO NOTHING;
      GET DIAGNOSTICS _count = ROW_COUNT;
      _inserted := _inserted + _count;

    ELSIF _rule.target = 'EMPLOYEE_TYPE' THEN
      INSERT INTO public.training_course_enrollments (
        staff_id, course_id, version_id, assignment_id, status, due_on
      )
      SELECT s.id, _course, _version, _assignment_id, 'ENROLLED', _due
      FROM public.staff s
      WHERE s.deleted_at IS NULL
        AND s.status = 'active'
        AND s.employment_type = _rule.employment_type
        AND public.user_can_access_staff(s.id)
      ON CONFLICT (staff_id, version_id) DO NOTHING;
      GET DIAGNOSTICS _count = ROW_COUNT;
      _inserted := _inserted + _count;
    END IF;
  END LOOP;

  RETURN _inserted;
END;
$$;

COMMENT ON FUNCTION public.training_apply_assignment(uuid) IS
  'Enrolls in-scope staff for one assignment. Does not accept or write a score or completion. COMPANY is the only target that skips user_can_access_staff, and only when training.assign.company is held. BUSINESS_UNIT, TEAM, and CUSTOM are stored and not expanded.';

REVOKE ALL ON FUNCTION public.training_apply_assignment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.training_apply_assignment(uuid) TO authenticated, service_role;
