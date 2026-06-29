-- Master departments for staff activity areas and staff_department junction

CREATE TABLE IF NOT EXISTS public.master_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT master_departments_name_unique UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS public.staff_departments (
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.master_departments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_departments_department ON public.staff_departments(department_id);
CREATE INDEX IF NOT EXISTS idx_master_departments_active_sort ON public.master_departments(active, sort_order, name);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_departments TO authenticated;
GRANT ALL ON public.master_departments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_departments TO authenticated;
GRANT ALL ON public.staff_departments TO service_role;

ALTER TABLE public.master_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "master_departments read" ON public.master_departments;
CREATE POLICY "master_departments read" ON public.master_departments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "master_departments write" ON public.master_departments;
CREATE POLICY "master_departments write" ON public.master_departments
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "staff_departments scoped" ON public.staff_departments;
CREATE POLICY "staff_departments scoped" ON public.staff_departments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_departments.staff_id
        AND public.user_can_access_location(s.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_departments.staff_id
        AND public.user_can_access_location(s.location_id)
    )
  );

DROP TRIGGER IF EXISTS trg_master_departments_updated ON public.master_departments;
CREATE TRIGGER trg_master_departments_updated
  BEFORE UPDATE ON public.master_departments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.master_departments (name, code, sort_order) VALUES
  ('OverAll', 'OVERALL', 10),
  ('Ticketing Counter', 'TICKET', 20),
  ('Main Hub', 'HUB', 30),
  ('Battle Arena', 'BATTLE', 40),
  ('Floor is Lava', 'LAVA', 50),
  ('Mini Golf', 'GOLF', 60),
  ('Trampoline', 'TRAMP', 70),
  ('Kids Tribe', 'KIDS', 80),
  ('Go kart+Acade Games', 'KART_ACADE', 90),
  ('Go kart', 'KART', 91),
  ('Acade Games', 'ACADE', 92),
  ('Archery', 'ARCH', 100),
  ('Hoopshots+Billiards', 'HOOP_BILL', 110),
  ('Hoopshots', 'HOOP', 111),
  ('Billiards', 'BILL', 112),
  ('Ar Racing+SpinCity+Ping Pong', 'RACE_SPIN_PING', 120),
  ('Ar Racing', 'AR_RACE', 121),
  ('SpinCity', 'SPIN', 122),
  ('Ping Pong', 'PING', 123),
  ('Dartxxx+Ax+Herox+PSS', 'DART_COMBO', 130),
  ('Maintenance', 'MAINT', 140),
  ('Soft Play', 'SOFT', 150),
  ('Ballpit', 'BALLPIT', 160),
  ('Ticket Checking', 'TCK_CHK', 170),
  ('Driving Lane', 'DRIVE', 180),
  ('Driving Lane/ Yalla Toys', 'DRIVE_YALLA', 181),
  ('Yalla Toys', 'YALLA', 182),
  ('INFLATA park', 'INFLATA', 190),
  ('Inflata park', 'INFLATA2', 191),
  ('Grab and win', 'GRAB', 200),
  ('Space tribe', 'SPACE', 210),
  ('Inflate kids', 'INFLATE_KIDS', 220),
  ('Vacation', 'VACATION', 230),
  ('Cashier', 'CASHIER', 240),
  ('Operations', 'OPS', 250)
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.split_staff_department_tokens(raw text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    array_agg(DISTINCT trim(t) ORDER BY trim(t)),
    '{}'::text[]
  )
  FROM unnest(regexp_split_to_array(COALESCE(raw, ''), '[+,/]')) AS t
  WHERE trim(t) <> '';
$$;

CREATE OR REPLACE FUNCTION public.resolve_master_department_id(token text)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  dept_id uuid;
  cleaned text := trim(token);
BEGIN
  IF cleaned = '' THEN
    RETURN NULL;
  END IF;

  SELECT id INTO dept_id
  FROM public.master_departments
  WHERE lower(trim(name)) = lower(cleaned)
  LIMIT 1;

  IF dept_id IS NOT NULL THEN
    RETURN dept_id;
  END IF;

  SELECT id INTO dept_id
  FROM public.master_departments
  WHERE lower(replace(name, ' ', '')) = lower(replace(cleaned, ' ', ''))
  LIMIT 1;

  IF dept_id IS NOT NULL THEN
    RETURN dept_id;
  END IF;

  INSERT INTO public.master_departments (name, sort_order)
  VALUES (cleaned, 900)
  ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO dept_id;

  RETURN dept_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_staff_department_display(p_staff_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  label text;
BEGIN
  SELECT string_agg(md.name, ', ' ORDER BY md.sort_order, md.name)
  INTO label
  FROM public.staff_departments sd
  JOIN public.master_departments md ON md.id = sd.department_id
  WHERE sd.staff_id = p_staff_id;

  UPDATE public.staff
  SET department = NULLIF(trim(label), '')
  WHERE id = p_staff_id;
END;
$$;

DO $$
DECLARE
  r RECORD;
  token text;
  dept_id uuid;
  tokens text[];
BEGIN
  FOR r IN
    SELECT s.id, s.department
    FROM public.staff s
    WHERE s.department IS NOT NULL
      AND trim(s.department) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM public.staff_departments sd WHERE sd.staff_id = s.id
      )
  LOOP
    tokens := public.split_staff_department_tokens(r.department);

    IF array_length(tokens, 1) IS NULL THEN
      dept_id := public.resolve_master_department_id(r.department);
      IF dept_id IS NOT NULL THEN
        INSERT INTO public.staff_departments (staff_id, department_id)
        VALUES (r.id, dept_id)
        ON CONFLICT DO NOTHING;
      END IF;
    ELSE
      FOREACH token IN ARRAY tokens LOOP
        dept_id := public.resolve_master_department_id(token);
        IF dept_id IS NOT NULL THEN
          INSERT INTO public.staff_departments (staff_id, department_id)
          VALUES (r.id, dept_id)
          ON CONFLICT DO NOTHING;
        END IF;
      END LOOP;
    END IF;

    PERFORM public.sync_staff_department_display(r.id);
  END LOOP;
END;
$$;
