-- Revert OT claims that Head of Operations mistakenly HR-approved (ceo → hr.ot.approve).
-- Restores status to ops_approved (HOO approved) so they sit in the HR queue again.
-- Only touches mid-flight hr_approved rows with no GM stamp.

DO $$
DECLARE
  v_hoo_user_id uuid;
  v_count int;
BEGIN
  SELECT s.user_id
    INTO v_hoo_user_id
  FROM public.staff s
  WHERE s.id = '64cde3a2-90fd-47c1-83cc-fa49900b1f43'
    AND s.deleted_at IS NULL
    AND s.user_id IS NOT NULL;

  IF v_hoo_user_id IS NULL THEN
    SELECT s.user_id
      INTO v_hoo_user_id
    FROM public.staff s
    WHERE s.deleted_at IS NULL
      AND lower(btrim(s.full_name)) = 'rajan pathak'
      AND btrim(s.employee_code) = '9'
      AND s.user_id IS NOT NULL;
  END IF;

  IF v_hoo_user_id IS NULL THEN
    RAISE NOTICE 'ot_revert_hoo_mistaken_hr_approve: HOO user not found; skipping';
    RETURN;
  END IF;

  UPDATE public.hr_ot_claims
  SET
    status = 'ops_approved',
    approved_by = NULL,
    approved_at = NULL,
    approved_signer_name = NULL,
    approved_signer_signature_url = NULL,
    updated_at = now()
  WHERE status = 'hr_approved'
    AND gm_approved_by IS NULL
    AND gm_approved_at IS NULL
    AND (
      approved_by = v_hoo_user_id
      OR (approved_by IS NOT NULL AND approved_by = ops_approved_by)
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'ot_revert_hoo_mistaken_hr_approve: reverted % claim(s) to ops_approved', v_count;
END $$;
