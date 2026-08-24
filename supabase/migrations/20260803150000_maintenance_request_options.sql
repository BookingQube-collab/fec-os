-- Global master options for maintenance request category / issue type
-- "Other" is a UI sentinel only — never seeded. Custom names are stored instead.

CREATE TABLE IF NOT EXISTS public.maintenance_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS maintenance_categories_name_ci_unique
  ON public.maintenance_categories (lower(btrim(name)));

CREATE INDEX IF NOT EXISTS idx_maintenance_categories_active_sort
  ON public.maintenance_categories(is_active, sort_order, name);

CREATE TABLE IF NOT EXISTS public.maintenance_issue_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS maintenance_issue_types_name_ci_unique
  ON public.maintenance_issue_types (lower(btrim(name)));

CREATE INDEX IF NOT EXISTS idx_maintenance_issue_types_active_sort
  ON public.maintenance_issue_types(is_active, sort_order, name);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_categories TO authenticated;
GRANT ALL ON public.maintenance_categories TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_issue_types TO authenticated;
GRANT ALL ON public.maintenance_issue_types TO service_role;

ALTER TABLE public.maintenance_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_issue_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "maintenance_categories read" ON public.maintenance_categories;
CREATE POLICY "maintenance_categories read" ON public.maintenance_categories
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "maintenance_categories insert" ON public.maintenance_categories;
CREATE POLICY "maintenance_categories insert" ON public.maintenance_categories
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "maintenance_categories update" ON public.maintenance_categories;
CREATE POLICY "maintenance_categories update" ON public.maintenance_categories
  FOR UPDATE TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "maintenance_categories delete" ON public.maintenance_categories;
CREATE POLICY "maintenance_categories delete" ON public.maintenance_categories
  FOR DELETE TO authenticated
  USING (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "maintenance_issue_types read" ON public.maintenance_issue_types;
CREATE POLICY "maintenance_issue_types read" ON public.maintenance_issue_types
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "maintenance_issue_types insert" ON public.maintenance_issue_types;
CREATE POLICY "maintenance_issue_types insert" ON public.maintenance_issue_types
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "maintenance_issue_types update" ON public.maintenance_issue_types;
CREATE POLICY "maintenance_issue_types update" ON public.maintenance_issue_types
  FOR UPDATE TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "maintenance_issue_types delete" ON public.maintenance_issue_types;
CREATE POLICY "maintenance_issue_types delete" ON public.maintenance_issue_types
  FOR DELETE TO authenticated
  USING (public.current_user_role_level() >= 55);

DROP TRIGGER IF EXISTS trg_maintenance_categories_updated ON public.maintenance_categories;
CREATE TRIGGER trg_maintenance_categories_updated
  BEFORE UPDATE ON public.maintenance_categories
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_maintenance_issue_types_updated ON public.maintenance_issue_types;
CREATE TRIGGER trg_maintenance_issue_types_updated
  BEFORE UPDATE ON public.maintenance_issue_types
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Case-insensitive ensure: return existing casing when duplicate. Never store "Other".
CREATE OR REPLACE FUNCTION public.ensure_maintenance_category(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trimmed text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_existing text;
BEGIN
  IF v_trimmed = '' THEN
    RAISE EXCEPTION 'Category name is required';
  END IF;
  IF lower(v_trimmed) = 'other' THEN
    RAISE EXCEPTION 'Enter a custom category name instead of Other';
  END IF;

  SELECT c.name INTO v_existing
  FROM public.maintenance_categories c
  WHERE lower(btrim(c.name)) = lower(v_trimmed)
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.maintenance_categories
    SET is_active = true
    WHERE lower(btrim(name)) = lower(v_trimmed)
      AND is_active IS DISTINCT FROM true;
    RETURN v_existing;
  END IF;

  INSERT INTO public.maintenance_categories (name, sort_order, is_system, is_active)
  VALUES (v_trimmed, 500, false, true)
  RETURNING name INTO v_existing;
  RETURN v_existing;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_maintenance_issue_type(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trimmed text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_existing text;
BEGIN
  IF v_trimmed = '' THEN
    RAISE EXCEPTION 'Issue type name is required';
  END IF;
  IF lower(v_trimmed) = 'other' THEN
    RAISE EXCEPTION 'Enter a custom issue type name instead of Other';
  END IF;

  SELECT t.name INTO v_existing
  FROM public.maintenance_issue_types t
  WHERE lower(btrim(t.name)) = lower(v_trimmed)
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.maintenance_issue_types
    SET is_active = true
    WHERE lower(btrim(name)) = lower(v_trimmed)
      AND is_active IS DISTINCT FROM true;
    RETURN v_existing;
  END IF;

  INSERT INTO public.maintenance_issue_types (name, sort_order, is_system, is_active)
  VALUES (v_trimmed, 500, false, true)
  RETURNING name INTO v_existing;
  RETURN v_existing;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_maintenance_category(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_maintenance_category(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_maintenance_issue_type(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_maintenance_issue_type(text) TO service_role;

INSERT INTO public.maintenance_categories (name, sort_order, is_system)
SELECT v.name, v.sort_order, true
FROM (
  VALUES
    ('Electrical', 10),
    ('Plumbing', 20),
    ('HVAC', 30),
    ('Structural', 40),
    ('Equipment', 50),
    ('General', 60)
) AS v(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.maintenance_categories c
  WHERE lower(btrim(c.name)) = lower(v.name)
);

INSERT INTO public.maintenance_issue_types (name, sort_order, is_system)
SELECT v.name, v.sort_order, true
FROM (
  VALUES
    ('Breakdown', 10),
    ('Leak', 20),
    ('Noise', 30),
    ('Safety', 40),
    ('Cleaning', 50)
) AS v(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.maintenance_issue_types t
  WHERE lower(btrim(t.name)) = lower(v.name)
);
