-- Pre-site-step leave ladder was manager → ops → hr; that first seat was Sr. Site
-- (same as missed-punch), not Venue Supervisor. Mary Wangare Muiruri stamped
-- Louie / Mani / Waseem on manager, so the Approve trail showed
-- "Supervisor · Mary Wangare Muiruri". Remap those Sr. Site stamps to site.
--
-- Scope: acted_by is a known Sr. Site login (Mary), leave has no site step yet.
-- Leaves that already have a site seat are untouched. Idempotent.

DO $$
DECLARE
  v_sr_site_ids uuid[];
  v_rowcount int := 0;
BEGIN
  SELECT array_agg(DISTINCT uid)
    INTO v_sr_site_ids
  FROM (
    SELECT s.user_id AS uid
    FROM public.staff s
    WHERE s.deleted_at IS NULL
      AND s.user_id IS NOT NULL
      AND (
        lower(btrim(s.full_name)) = 'mary wangare muiruri'
        OR upper(btrim(coalesce(s.employee_code, ''))) = 'INF-CC-VS'
        OR lower(btrim(coalesce(s.job_title, ''))) IN (
          'sr. site supervisor',
          'sr site supervisor',
          'senior site supervisor'
        )
      )
    UNION
    SELECT p.id AS uid
    FROM public.profiles p
    WHERE lower(btrim(coalesce(p.display_name, ''))) = 'mary wangare muiruri'
       OR upper(btrim(coalesce(p.employee_code, ''))) IN ('INF-CC-VS', '29440401619', '29440401419')
    UNION
    SELECT u.id AS uid
    FROM auth.users u
    WHERE lower(u.email) IN (
      'mary.supervisor@fec.test',
      'mary.supervisor@fec.com',
      'srsupervisor@fec.qa'
    )
  ) targets
  WHERE uid IS NOT NULL;

  IF v_sr_site_ids IS NULL OR cardinality(v_sr_site_ids) = 0 THEN
    RAISE NOTICE 'leave_legacy_sr_site_manager_to_site: Sr. Site actor ids not found; skipping';
    RETURN;
  END IF;

  UPDATE public.hr_leave_approvals a
  SET step_role = 'site'
  WHERE a.step_role = 'manager'
    AND a.status IN ('approved', 'skipped')
    AND a.acted_by = ANY (v_sr_site_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM public.hr_leave_approvals s
      WHERE s.leave_id = a.leave_id
        AND s.step_role = 'site'
    );

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  RAISE NOTICE 'leave_legacy_sr_site_manager_to_site: remapped=%', v_rowcount;
END $$;
