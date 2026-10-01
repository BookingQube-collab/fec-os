-- HR master lists for position, gender, and nationality.
-- Departments stay on master_departments (no second department table).
-- Staff keep the existing text columns: staff.job_title, staff_profile_ext.gender,
-- staff_profile_ext.nationality. Seeds are the distinct non-empty values on current
-- staff (deleted_at is null), plus the gender values already used in the app
-- (male, female, other). Archived staff text is left as stored.
-- Gender is no longer limited to the old check so HR can add a value before using it.

ALTER TABLE public.staff_profile_ext
  DROP CONSTRAINT IF EXISTS staff_profile_ext_gender_chk;

CREATE TABLE IF NOT EXISTS public.master_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT master_positions_name_not_blank CHECK (btrim(name) <> '')
);

CREATE TABLE IF NOT EXISTS public.master_genders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT master_genders_name_not_blank CHECK (btrim(name) <> '')
);

CREATE TABLE IF NOT EXISTS public.master_nationalities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT master_nationalities_name_not_blank CHECK (btrim(name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS master_positions_name_key
  ON public.master_positions (lower(btrim(name)));
CREATE UNIQUE INDEX IF NOT EXISTS master_genders_name_key
  ON public.master_genders (lower(btrim(name)));
CREATE UNIQUE INDEX IF NOT EXISTS master_nationalities_name_key
  ON public.master_nationalities (lower(btrim(name)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_positions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_genders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_nationalities TO authenticated;
GRANT ALL ON public.master_positions TO service_role;
GRANT ALL ON public.master_genders TO service_role;
GRANT ALL ON public.master_nationalities TO service_role;

ALTER TABLE public.master_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_genders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_nationalities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "master_positions read" ON public.master_positions;
CREATE POLICY "master_positions read" ON public.master_positions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "master_positions write" ON public.master_positions;
CREATE POLICY "master_positions write" ON public.master_positions
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "master_genders read" ON public.master_genders;
CREATE POLICY "master_genders read" ON public.master_genders
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "master_genders write" ON public.master_genders;
CREATE POLICY "master_genders write" ON public.master_genders
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "master_nationalities read" ON public.master_nationalities;
CREATE POLICY "master_nationalities read" ON public.master_nationalities
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "master_nationalities write" ON public.master_nationalities;
CREATE POLICY "master_nationalities write" ON public.master_nationalities
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

DROP TRIGGER IF EXISTS trg_master_positions_updated ON public.master_positions;
CREATE TRIGGER trg_master_positions_updated
  BEFORE UPDATE ON public.master_positions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_master_genders_updated ON public.master_genders;
CREATE TRIGGER trg_master_genders_updated
  BEFORE UPDATE ON public.master_genders
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_master_nationalities_updated ON public.master_nationalities;
CREATE TRIGGER trg_master_nationalities_updated
  BEFORE UPDATE ON public.master_nationalities
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.master_positions (name)
SELECT picked.name
FROM (
  SELECT DISTINCT ON (lower(btrim(s.job_title))) btrim(s.job_title) AS name
  FROM public.staff s
  WHERE s.deleted_at IS NULL
    AND s.job_title IS NOT NULL
    AND btrim(s.job_title) <> ''
  ORDER BY lower(btrim(s.job_title)), length(btrim(s.job_title)), btrim(s.job_title)
) picked
WHERE NOT EXISTS (
  SELECT 1 FROM public.master_positions p
  WHERE lower(btrim(p.name)) = lower(picked.name)
);

INSERT INTO public.master_genders (name)
SELECT picked.name
FROM (
  SELECT DISTINCT ON (lower(btrim(e.gender))) btrim(e.gender) AS name
  FROM public.staff_profile_ext e
  JOIN public.staff s ON s.id = e.staff_id
  WHERE s.deleted_at IS NULL
    AND e.gender IS NOT NULL
    AND btrim(e.gender) <> ''
  ORDER BY lower(btrim(e.gender)), length(btrim(e.gender)), btrim(e.gender)
) picked
WHERE NOT EXISTS (
  SELECT 1 FROM public.master_genders g
  WHERE lower(btrim(g.name)) = lower(picked.name)
);

INSERT INTO public.master_genders (name)
SELECT seed.name
FROM (VALUES ('male'), ('female'), ('other')) AS seed(name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.master_genders g
  WHERE lower(btrim(g.name)) = lower(seed.name)
);

INSERT INTO public.master_nationalities (name)
SELECT picked.name
FROM (
  SELECT DISTINCT ON (lower(btrim(e.nationality))) btrim(e.nationality) AS name
  FROM public.staff_profile_ext e
  JOIN public.staff s ON s.id = e.staff_id
  WHERE s.deleted_at IS NULL
    AND e.nationality IS NOT NULL
    AND btrim(e.nationality) <> ''
  ORDER BY lower(btrim(e.nationality)), length(btrim(e.nationality)), btrim(e.nationality)
) picked
WHERE NOT EXISTS (
  SELECT 1 FROM public.master_nationalities n
  WHERE lower(btrim(n.name)) = lower(picked.name)
);
