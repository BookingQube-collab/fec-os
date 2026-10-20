-- Site supervisors (Venue / Site / Sr. Site) may open OT claims and submit
-- supervisor OT requests even when their login role is cashier_host (level 20).
-- App gate: hr.ot.verify via isSiteSupervisorTitle in canActorPerform.
-- Does not grant HR approve / payroll (hr.ot.approve stays role-based).

CREATE OR REPLACE FUNCTION public.current_user_is_site_ot_supervisor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.user_id = auth.uid()
      AND s.deleted_at IS NULL
      AND (
        s.staff_role::text = 'venue_supervisor'
        OR COALESCE(s.job_title, '') ~* '(^|[[:space:]/])(sr\.?[[:space:]]+|senior[[:space:]]+)?site[[:space:]]+supervisor($|[^[:alpha:]])'
        OR COALESCE(s.job_title, '') ~* 'venue[[:space:]]+supervisor'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_is_site_ot_supervisor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_is_site_ot_supervisor() TO authenticated, service_role;

DROP POLICY IF EXISTS "hr_ot_claims read" ON public.hr_ot_claims;
CREATE POLICY "hr_ot_claims read" ON public.hr_ot_claims
  FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR public.current_user_is_site_ot_supervisor()
    OR staff_id IN (
      SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "hr_ot_claims insert" ON public.hr_ot_claims;
CREATE POLICY "hr_ot_claims insert" ON public.hr_ot_claims
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role_level() >= 55
    OR public.current_user_is_site_ot_supervisor()
    OR staff_id IN (
      SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "hr_ot_claims update" ON public.hr_ot_claims;
CREATE POLICY "hr_ot_claims update" ON public.hr_ot_claims
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR public.current_user_is_site_ot_supervisor()
    OR staff_id IN (
      SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  )
  WITH CHECK (
    public.current_user_role_level() >= 55
    OR public.current_user_is_site_ot_supervisor()
    OR staff_id IN (
      SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "hr_ot_claim_approvals read" ON public.hr_ot_claim_approvals;
CREATE POLICY "hr_ot_claim_approvals read" ON public.hr_ot_claim_approvals
  FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR public.current_user_is_site_ot_supervisor()
    OR EXISTS (
      SELECT 1 FROM public.hr_ot_claims c
      JOIN public.staff s ON s.id = c.staff_id
      WHERE c.id = claim_id AND s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "hr_ot_claim_approvals insert" ON public.hr_ot_claim_approvals;
CREATE POLICY "hr_ot_claim_approvals insert" ON public.hr_ot_claim_approvals
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role_level() >= 55
    OR public.current_user_is_site_ot_supervisor()
    OR EXISTS (
      SELECT 1 FROM public.hr_ot_claims c
      JOIN public.staff s ON s.id = c.staff_id
      WHERE c.id = claim_id AND s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );
