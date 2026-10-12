-- Rajan Pathak (employee code 9, Head of Operations) gets the same CEO
-- login Adil Bashir Ahmed has: role ceo, level 100, every location.
-- His regional_ops and cashier_host rows stay. This does not change the
-- Head of Operations title, other staff, or RLS for everyone else.

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT s.user_id
    INTO v_user_id
  FROM public.staff s
  WHERE s.id = '64cde3a2-90fd-47c1-83cc-fa49900b1f43'
    AND s.deleted_at IS NULL
    AND lower(btrim(s.full_name)) = 'rajan pathak'
    AND btrim(s.employee_code) = '9'
    AND s.user_id IS NOT NULL;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Rajan Pathak staff login was not found';
  END IF;

  INSERT INTO public.user_roles (user_id, role, role_level, location_ids)
  VALUES (v_user_id, 'ceo'::public.app_role, 100, '{}'::uuid[])
  ON CONFLICT (user_id, role) DO UPDATE
  SET role_level = EXCLUDED.role_level,
      location_ids = EXCLUDED.location_ids;
END $$;
