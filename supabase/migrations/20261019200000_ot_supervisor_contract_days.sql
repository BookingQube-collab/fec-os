-- Supervisor OT requests for 26- and 28-day contracts.
-- staff_profile_ext.contract_working_days is the contract basis (no earlier column).
-- NULL means the employee stays on attendance-derived OT claims.
-- 26 or 28 means a supervisor submits the claim; attendance minutes are not eligible OT.

ALTER TABLE public.staff_profile_ext
  ADD COLUMN IF NOT EXISTS contract_working_days smallint;

ALTER TABLE public.staff_profile_ext
  DROP CONSTRAINT IF EXISTS staff_profile_ext_contract_days_chk;

ALTER TABLE public.staff_profile_ext
  ADD CONSTRAINT staff_profile_ext_contract_days_chk
  CHECK (contract_working_days IS NULL OR contract_working_days IN (26, 28));

COMMENT ON COLUMN public.staff_profile_ext.contract_working_days IS
  'Monthly working-day contract used for supervisor OT. 26 or 28: supervisor creates the claim and the hourly rate uses this divisor. NULL: attendance-derived OT claims.';

ALTER TABLE public.hr_ot_claims
  ADD COLUMN IF NOT EXISTS claim_source text NOT NULL DEFAULT 'attendance',
  ADD COLUMN IF NOT EXISTS purpose text,
  ADD COLUMN IF NOT EXISTS contract_working_days smallint;

ALTER TABLE public.hr_ot_claims
  DROP CONSTRAINT IF EXISTS hr_ot_claims_source_chk;

ALTER TABLE public.hr_ot_claims
  ADD CONSTRAINT hr_ot_claims_source_chk
  CHECK (claim_source IN ('attendance', 'supervisor'));

ALTER TABLE public.hr_ot_claims
  DROP CONSTRAINT IF EXISTS hr_ot_claims_contract_days_chk;

ALTER TABLE public.hr_ot_claims
  ADD CONSTRAINT hr_ot_claims_contract_days_chk
  CHECK (contract_working_days IS NULL OR contract_working_days IN (26, 28));

COMMENT ON COLUMN public.hr_ot_claims.claim_source IS
  'attendance: eligible minutes from attendance. supervisor: requested hours for a 26/28-day contract.';

COMMENT ON COLUMN public.hr_ot_claims.contract_working_days IS
  'Snapshot of staff_profile_ext.contract_working_days when a supervisor claim is submitted. Used as the monthly divisor for the OT amount.';

-- Expose the new field on the masked profile reader. Same masking rules as 20261002140000.
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
    'contract_working_days', ext.contract_working_days,
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
