-- Roaming technicians: one staff row, primary location + extra punch sites.
-- Salary / roster headcount stay on staff.location_id (home) only.

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS is_roaming boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS staff_is_roaming_idx
  ON public.staff (is_roaming)
  WHERE is_roaming AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.staff_work_locations (
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (staff_id, location_id)
);

CREATE INDEX IF NOT EXISTS staff_work_locations_location_idx
  ON public.staff_work_locations (location_id, staff_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_work_locations TO authenticated;
GRANT ALL ON public.staff_work_locations TO service_role;

CREATE OR REPLACE FUNCTION public.user_can_access_staff(_staff_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.id = _staff_id
      AND (
        public.user_can_access_location(s.location_id)
        OR EXISTS (
          SELECT 1
          FROM public.staff_work_locations w
          WHERE w.staff_id = s.id
            AND public.user_can_access_location(w.location_id)
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.user_can_access_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_access_staff(uuid) TO authenticated, service_role;

ALTER TABLE public.staff_work_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_work_locations_select" ON public.staff_work_locations;
CREATE POLICY "staff_work_locations_select" ON public.staff_work_locations
  FOR SELECT TO authenticated
  USING (public.user_can_access_staff(staff_id) OR public.user_can_access_location(location_id));

DROP POLICY IF EXISTS "staff_work_locations_write" ON public.staff_work_locations;
CREATE POLICY "staff_work_locations_write" ON public.staff_work_locations
  FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

DROP POLICY IF EXISTS "staff scoped" ON public.staff;
CREATE POLICY "staff scoped" ON public.staff FOR ALL TO authenticated
  USING (public.user_can_access_staff(id))
  WITH CHECK (public.user_can_access_location(location_id));

-- Restore / seed Russell Bombita Pante as a single roaming FEC technician.
DO $$
DECLARE
  inf uuid;
  kds uuid;
  ua uuid;
  sid uuid;
  keep uuid := 'a8c3e5f1-9b2d-4e6a-8c1f-7d4b0a2e9f31'::uuid;
  emp_code text;
  n int;
  dup record;
BEGIN
  SELECT l.id INTO inf FROM public.locations l WHERE l.code = 'INF-CC';
  SELECT l.id INTO kds FROM public.locations l WHERE l.code = 'KDS-CC';
  SELECT l.id INTO ua FROM public.locations l WHERE l.code = 'UA-DM';
  IF inf IS NULL THEN
    RETURN;
  END IF;

  SELECT s.id INTO sid
  FROM public.staff s
  WHERE s.id = keep
     OR lower(s.full_name) LIKE 'russell%'
  ORDER BY
    CASE WHEN s.id = keep THEN 0 ELSE 1 END,
    CASE WHEN s.deleted_at IS NULL THEN 0 ELSE 1 END,
    s.created_at NULLS LAST
  LIMIT 1;

  IF sid IS NULL THEN
    sid := keep;
  END IF;

  emp_code := 'FEC-TEC01';
  IF EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.employee_code = emp_code AND s.id IS DISTINCT FROM sid
  ) THEN
    n := 2;
    LOOP
      emp_code := 'FEC-TEC' || lpad(n::text, 2, '0');
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.staff s WHERE s.employee_code = emp_code AND s.id IS DISTINCT FROM sid
      );
      n := n + 1;
    END LOOP;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = sid) THEN
    INSERT INTO public.staff (
      id, location_id, employee_code, full_name, job_title, department,
      hire_date, status, phone, staff_role, qid, is_roaming, deleted_at, employment_type
    )
    VALUES (
      sid, inf, emp_code, 'Russell Bombita Pante', 'Technician', 'Maintenance',
      CURRENT_DATE, 'active', NULL, 'technician'::public.staff_role, NULL, true, NULL, 'permanent'
    );
  ELSE
    UPDATE public.staff
    SET
      full_name = 'Russell Bombita Pante',
      employee_code = emp_code,
      job_title = COALESCE(NULLIF(job_title, ''), 'Technician'),
      department = COALESCE(NULLIF(department, ''), 'Maintenance'),
      staff_role = 'technician'::public.staff_role,
      location_id = inf,
      status = 'active',
      deleted_at = NULL,
      is_roaming = true,
      employment_type = COALESCE(employment_type, 'permanent')
    WHERE id = sid;
  END IF;

  INSERT INTO public.staff_work_locations (staff_id, location_id)
  SELECT sid, loc
  FROM unnest(ARRAY[inf, kds, ua]) AS loc
  WHERE loc IS NOT NULL
  ON CONFLICT (staff_id, location_id) DO NOTHING;

  FOR dup IN
    SELECT s.id
    FROM public.staff s
    WHERE s.id <> sid
      AND s.deleted_at IS NULL
      AND lower(s.full_name) LIKE 'russell%'
  LOOP
    UPDATE public.attendance_biometric_users SET staff_id = sid WHERE staff_id = dup.id;
    UPDATE public.attendance_logs SET staff_id = sid WHERE staff_id = dup.id;
    UPDATE public.attendance_daily_summary SET staff_id = sid WHERE staff_id = dup.id;
    UPDATE public.staff
    SET status = 'terminated', deleted_at = now()
    WHERE id = dup.id;
  END LOOP;
END;
$$;
