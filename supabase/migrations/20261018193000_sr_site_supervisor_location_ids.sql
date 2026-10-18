-- Sr. Site Supervisor (Mary): relink staff.user_id to her login when drifted,
-- and expand user_roles.location_ids to her venue span.
--
-- Root cause of All+INF-CC chips:
--   1) staff.user_id pointed at a different auth user than mary.supervisor@fec.test
--      → loadLinkedStaffRecord returned null → branch_gm treated as company-wide
--   2) that login's user_roles.location_ids was only INF-CC → RLS on /api/sites
--
-- Idempotent.

DO $$
DECLARE
  v_staff_id uuid;
  v_login_id uuid;
  v_user_id uuid;
  v_span uuid[];
BEGIN
  SELECT array_agg(l.id ORDER BY l.code)
    INTO v_span
  FROM public.locations l
  WHERE l.status = 'active'
    AND upper(btrim(l.code)) = ANY (
      ARRAY['CAR-AP', 'CB-DSM', 'CB-VM', 'INF-CC', 'KDS-CC', 'KDS-DM', 'UA-DM']
    );

  IF v_span IS NULL OR cardinality(v_span) = 0 THEN
    RAISE NOTICE 'sr site location_ids: no venue ids found — skip';
    RETURN;
  END IF;

  SELECT s.id
    INTO v_staff_id
  FROM public.staff s
  WHERE s.deleted_at IS NULL
    AND (
      lower(btrim(s.full_name)) = 'mary wangare muiruri'
      OR upper(btrim(coalesce(s.employee_code, ''))) = 'INF-CC-VS'
      OR btrim(coalesce(s.qid, '')) = '29440401619'
    )
  ORDER BY s.created_at DESC NULLS LAST, s.id DESC
  LIMIT 1;

  -- Prefer the auth user that owns the supervisor test / prod login emails.
  SELECT u.id
    INTO v_login_id
  FROM auth.users u
  WHERE lower(u.email) IN (
    'mary.supervisor@fec.test',
    'mary.supervisor@fec.com',
    'srsupervisor@fec.qa'
  )
  ORDER BY
    CASE lower(u.email)
      WHEN 'mary.supervisor@fec.test' THEN 0
      WHEN 'srsupervisor@fec.qa' THEN 1
      ELSE 2
    END,
    u.created_at DESC
  LIMIT 1;

  IF v_staff_id IS NOT NULL AND v_login_id IS NOT NULL THEN
    UPDATE public.staff
    SET user_id = v_login_id
    WHERE id = v_staff_id
      AND (user_id IS DISTINCT FROM v_login_id);
  END IF;

  FOR v_user_id IN
    SELECT DISTINCT uid
    FROM (
      SELECT v_login_id AS uid
      WHERE v_login_id IS NOT NULL
      UNION
      SELECT s.user_id AS uid
      FROM public.staff s
      WHERE s.id = v_staff_id
        AND s.user_id IS NOT NULL
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
    WHERE uid IS NOT NULL
  LOOP
    UPDATE public.user_roles ur
    SET location_ids = (
      SELECT array_agg(DISTINCT loc_id)
      FROM unnest(coalesce(ur.location_ids, ARRAY[]::uuid[]) || v_span) AS loc_id
    )
    WHERE ur.user_id = v_user_id;
  END LOOP;
END $$;
