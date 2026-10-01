-- Phase 1: roster-scoped readers can load non-sensitive employee profile
-- fields. Identity numbers, bank details, and private notes stay masked unless
-- the caller is the employee or holds the existing sensitive / salary roles.
-- Does not add a second employee master.

ALTER TABLE public.staff_profile_ext
  ADD COLUMN IF NOT EXISTS skills text;

COMMENT ON COLUMN public.staff_profile_ext.skills IS
  'Free-text skills recorded on the employee master. Not a suitability score.';

CREATE OR REPLACE FUNCTION public.user_can_view_hr_sensitive()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role_level >= 55
      AND role IN ('ceo', 'coo', 'cfo', 'hr')
  );
$$;

REVOKE ALL ON FUNCTION public.user_can_view_hr_sensitive() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_view_hr_sensitive() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.read_staff_profile_ext(_staff_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ext public.staff_profile_ext%ROWTYPE;
  is_self boolean;
  can_identity boolean;
  can_pay boolean;
  can_notes boolean;
BEGIN
  is_self := EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.id = _staff_id
      AND s.user_id = auth.uid()
      AND s.deleted_at IS NULL
  );

  IF NOT (
    is_self
    OR public.user_can_view_staff_salary()
    OR public.user_can_view_hr_sensitive()
    OR public.user_can_access_staff(_staff_id)
  ) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO ext
  FROM public.staff_profile_ext
  WHERE staff_id = _staff_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  can_identity := is_self OR public.user_can_view_hr_sensitive();
  can_pay := is_self OR public.user_can_view_staff_salary();
  can_notes := is_self OR public.user_can_view_hr_sensitive();

  RETURN jsonb_build_object(
    'nationality', ext.nationality,
    'gender', ext.gender,
    'date_of_birth', ext.date_of_birth,
    'emergency_contact_name', ext.emergency_contact_name,
    'emergency_contact_phone', ext.emergency_contact_phone,
    'emergency_contact_relation', ext.emergency_contact_relation,
    'reporting_manager_staff_id', ext.reporting_manager_staff_id,
    'employment_category', ext.employment_category,
    'probation_start', ext.probation_start,
    'probation_end', ext.probation_end,
    'passport_number', CASE WHEN can_identity THEN ext.passport_number ELSE NULL END,
    'passport_expiry', ext.passport_expiry,
    'visa_number', CASE WHEN can_identity THEN ext.visa_number ELSE NULL END,
    'visa_expiry', ext.visa_expiry,
    'sponsorship_info', ext.sponsorship_info,
    'qid_expiry', ext.qid_expiry,
    'ticket_eligibility', ext.ticket_eligibility,
    'ticket_eligibility_months', ext.ticket_eligibility_months,
    'ticket_amount', CASE WHEN can_pay THEN ext.ticket_amount ELSE NULL END,
    'contract_start', ext.contract_start,
    'contract_end', ext.contract_end,
    'notes', CASE WHEN can_notes THEN ext.notes ELSE NULL END,
    'skills', ext.skills,
    'payment_method', CASE WHEN can_pay THEN ext.payment_method ELSE NULL END,
    'bank_name', CASE WHEN can_pay THEN ext.bank_name ELSE NULL END,
    'iban', CASE WHEN can_pay THEN ext.iban ELSE NULL END,
    'wps_employee_id', CASE WHEN can_pay THEN ext.wps_employee_id ELSE NULL END,
    'last_working_date', ext.last_working_date,
    'releasing_date', ext.releasing_date,
    'exit_reason', CASE WHEN can_notes THEN ext.exit_reason ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.read_staff_profile_ext(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.read_staff_profile_ext(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.read_staff_profile_ext(uuid) IS
  'Employee 360 profile extension. Masks identity numbers, bank fields, and private notes for callers who only have site roster access.';
