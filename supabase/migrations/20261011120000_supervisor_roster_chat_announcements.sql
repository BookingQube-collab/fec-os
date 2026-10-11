-- Duty managers and tech supervisors use the same roster import and
-- announcement write path as branch leadership. Permanent staff deletion
-- stays on the app's Safe Sync rule for venue roles.

CREATE OR REPLACE FUNCTION public.user_can_import_staff_roster()
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
      AND role IN (
        'ceo',
        'coo',
        'regional_ops',
        'hr',
        'branch_gm',
        'duty_manager',
        'tech_supervisor'
      )
  );
$$;

DROP POLICY IF EXISTS "hr_announcements read" ON public.hr_announcements;
CREATE POLICY "hr_announcements read" ON public.hr_announcements
  FOR SELECT TO authenticated
  USING (
    active = true
    OR public.current_user_role_level() >= 55
    OR public.has_role(auth.uid(), 'tech_supervisor'::public.app_role)
  );

DROP POLICY IF EXISTS "hr_announcements write" ON public.hr_announcements;
CREATE POLICY "hr_announcements write" ON public.hr_announcements
  FOR ALL TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR public.has_role(auth.uid(), 'tech_supervisor'::public.app_role)
  )
  WITH CHECK (
    public.current_user_role_level() >= 55
    OR public.has_role(auth.uid(), 'tech_supervisor'::public.app_role)
  );
