-- Reycie Mia Cenizal Memije (employee code 88, mia@fec.qa) gets the hr role
-- so she opens People & HR like other HR logins. App code then elevates only
-- Mia to company-wide People admin (org chart + CEO People extras). Her
-- cashier_host row stays. Other HR users are unchanged.

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT s.user_id
    INTO v_user_id
  FROM public.staff s
  WHERE s.id = 'd2effffa-7fa3-4871-83b9-f6de007b5ff7'
    AND s.deleted_at IS NULL
    AND btrim(s.employee_code) = '88'
    AND lower(btrim(s.full_name)) = 'reycie mia cenizal memije'
    AND s.user_id IS NOT NULL;

  IF v_user_id IS NULL THEN
    SELECT s.user_id
      INTO v_user_id
    FROM public.staff s
    WHERE s.deleted_at IS NULL
      AND s.user_id IS NOT NULL
      AND (
        btrim(s.employee_code) = '88'
        OR lower(btrim(coalesce(s.email, ''))) = 'mia@fec.qa'
      )
    ORDER BY CASE WHEN s.id = 'd2effffa-7fa3-4871-83b9-f6de007b5ff7' THEN 0 ELSE 1 END
    LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Mia (Reycie Mia Cenizal Memije / employee code 88) staff login was not found';
  END IF;

  INSERT INTO public.user_roles (user_id, role, role_level, location_ids)
  VALUES (v_user_id, 'hr'::public.app_role, 55, '{}'::uuid[])
  ON CONFLICT (user_id, role) DO UPDATE
  SET role_level = EXCLUDED.role_level,
      location_ids = EXCLUDED.location_ids;
END $$;
