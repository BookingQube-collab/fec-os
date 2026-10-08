-- Learner start timestamp and own-enrollment helpers.
-- started_at is set once. This file does not grant completion or score writes.

ALTER TABLE public.training_course_enrollments
  ADD COLUMN IF NOT EXISTS started_at timestamptz;

COMMENT ON COLUMN public.training_course_enrollments.started_at IS
  'Set once when the learner opens the course outline. Null means not started. It is not completion.';

CREATE OR REPLACE FUNCTION public.training_code_allows(_capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    LEFT JOIN public.role_capability_grants g
      ON g.role = ur.role
     AND g.capability = _capability
    WHERE ur.user_id = auth.uid()
      AND COALESCE(g.allowed, CASE _capability
        WHEN 'training.view' THEN ur.role::text = ANY (ARRAY['ceo','coo','cfo','regional_ops','branch_gm','duty_manager','tech_supervisor','hr','auditor'])
        WHEN 'training.learn' THEN ur.role::text = ANY (ARRAY['ceo','coo','cfo','regional_ops','branch_gm','duty_manager','tech_supervisor','technician','cashier_host','auditor','hr','customer_service'])
        WHEN 'training.create' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','branch_gm','hr'])
        WHEN 'training.edit' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','branch_gm','hr'])
        WHEN 'training.publish' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','hr'])
        WHEN 'training.archive' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','hr'])
        WHEN 'training.assign' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','branch_gm','duty_manager','hr'])
        WHEN 'training.assign.department' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','branch_gm','duty_manager','hr'])
        WHEN 'training.assign.site' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','branch_gm','hr'])
        WHEN 'training.assign.company' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','hr'])
        WHEN 'training.assessment.manage' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','branch_gm','hr'])
        WHEN 'training.assessment.grade' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','branch_gm','duty_manager','tech_supervisor','hr'])
        WHEN 'training.session.create' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','branch_gm','duty_manager','tech_supervisor','hr'])
        WHEN 'training.attendance.manage' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','branch_gm','duty_manager','tech_supervisor','hr'])
        WHEN 'training.certificate.view' THEN ur.role::text = ANY (ARRAY['ceo','coo','cfo','regional_ops','branch_gm','duty_manager','hr','auditor'])
        WHEN 'training.certificate.issue' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','branch_gm','hr'])
        WHEN 'training.certificate.revoke' THEN ur.role::text = ANY (ARRAY['ceo','coo','regional_ops','hr'])
        WHEN 'training.analytics.view' THEN ur.role::text = ANY (ARRAY['ceo','coo','cfo','regional_ops','branch_gm','hr','auditor'])
        WHEN 'training.reports.export' THEN ur.role::text = ANY (ARRAY['ceo','coo','cfo','regional_ops','branch_gm','hr','auditor'])
        ELSE false
      END)
  );
$$;

CREATE OR REPLACE FUNCTION public.training_my_required_flags()
RETURNS TABLE (enrollment_id uuid, required boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, COALESCE(a.required, false)
  FROM public.training_course_enrollments e
  LEFT JOIN public.training_assignments a ON a.id = e.assignment_id
  WHERE e.staff_id = public.training_actor_staff_id();
$$;

COMMENT ON FUNCTION public.training_my_required_flags() IS
  'Mandatory flag for the signed-in staff enrollments only. Does not list other employees.';

CREATE OR REPLACE FUNCTION public.training_mark_started(_enrollment_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _staff uuid := public.training_actor_staff_id();
  _owner uuid;
  _started timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _staff IS NULL THEN
    RAISE EXCEPTION 'no staff profile';
  END IF;

  SELECT e.staff_id, e.started_at
    INTO _owner, _started
  FROM public.training_course_enrollments e
  WHERE e.id = _enrollment_id;

  IF _owner IS NULL THEN
    RAISE EXCEPTION 'enrollment not found';
  END IF;
  IF _owner IS DISTINCT FROM _staff THEN
    RAISE EXCEPTION 'enrollment belongs to another employee';
  END IF;
  IF _started IS NOT NULL THEN
    RETURN _started;
  END IF;

  UPDATE public.training_course_enrollments e
  SET started_at = now(),
      status = CASE WHEN e.status = 'ENROLLED' THEN 'IN_PROGRESS' ELSE e.status END
  WHERE e.id = _enrollment_id
    AND e.staff_id = _staff
    AND e.started_at IS NULL
  RETURNING e.started_at INTO _started;

  RETURN _started;
END;
$$;

COMMENT ON FUNCTION public.training_mark_started(uuid) IS
  'Sets started_at once for the signed-in staff enrollment. Does not accept or write a score or completion.';

REVOKE ALL ON FUNCTION public.training_my_required_flags() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.training_mark_started(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.training_my_required_flags() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_mark_started(uuid) TO authenticated, service_role;
