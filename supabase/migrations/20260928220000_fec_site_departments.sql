-- FEC site departments are a separate catalog from head office.
-- audience = 'ho'  locations.code = 'HO' (names and HO staff assignments stay)
-- audience = 'fec' every other site
-- Names stay unique per audience so HO "F&B" and the FEC "F&B" parent can both exist.
-- F&B Cashier and F&B Supervisor are stored under FEC F&B so they do not collide
-- with site Cashier and Site Supervisor.

ALTER TABLE public.master_departments
  ADD COLUMN IF NOT EXISTS audience text;

UPDATE public.master_departments
SET audience = 'fec'
WHERE audience IS NULL OR audience NOT IN ('ho', 'fec');

UPDATE public.master_departments md
SET audience = 'ho'
WHERE EXISTS (
  SELECT 1
  FROM public.staff s
  JOIN public.locations l ON l.id = s.location_id
  LEFT JOIN public.staff_departments sd
    ON sd.staff_id = s.id AND sd.department_id = md.id
  WHERE s.deleted_at IS NULL
    AND l.code = 'HO'
    AND (
      sd.staff_id IS NOT NULL
      OR lower(trim(coalesce(s.department, ''))) = lower(trim(md.name))
    )
);

UPDATE public.master_departments
SET audience = 'ho'
WHERE name IN (
  'IT',
  'Site Operations',
  'HR',
  'Finance',
  'Administration',
  'Branding & Marketing',
  'Creatives',
  'Design/Creative',
  'F&B',
  'F&B Operations',
  'FEC',
  'Logistics',
  'Management',
  'Project',
  'Sales & Marketing',
  'Operations'
);

ALTER TABLE public.master_departments
  ALTER COLUMN audience SET DEFAULT 'fec';

ALTER TABLE public.master_departments
  ALTER COLUMN audience SET NOT NULL;

ALTER TABLE public.master_departments
  DROP CONSTRAINT IF EXISTS master_departments_audience_check;

ALTER TABLE public.master_departments
  ADD CONSTRAINT master_departments_audience_check
  CHECK (audience IN ('ho', 'fec'));

ALTER TABLE public.master_departments
  DROP CONSTRAINT IF EXISTS master_departments_name_unique;

ALTER TABLE public.master_departments
  DROP CONSTRAINT IF EXISTS master_departments_name_audience_unique;

ALTER TABLE public.master_departments
  ADD CONSTRAINT master_departments_name_audience_unique UNIQUE (name, audience);

INSERT INTO public.master_departments (name, code, sort_order, active, audience) VALUES
  ('Managing Director / Chief Executive Officer', 'MD_CEO', 1000, true, 'fec'),
  ('General Manager', 'GM', 1010, true, 'fec'),
  ('FEC Operations', 'FEC_OPS', 1020, true, 'fec'),
  ('Sr. Site Supervisor', 'SR_SITE_SUP', 1030, true, 'fec'),
  ('Site Supervisor', 'SITE_SUP', 1040, true, 'fec'),
  ('AV Specialist / FEC Supervisor', 'AV_FEC_SUP', 1050, true, 'fec'),
  ('FEC Arcade Technician', 'ARCADE_TECH', 1060, true, 'fec'),
  ('Team Leader', 'TEAM_LEAD', 1070, true, 'fec'),
  ('Crew / Attendant', 'CREW', 1080, true, 'fec'),
  ('Cashier', 'CASHIER', 1090, true, 'fec'),
  ('Maintenance Assistant / Electrician', 'MAINT_ELEC', 1100, true, 'fec'),
  ('Artist', 'ARTIST', 1110, true, 'fec'),
  ('Cleaner', 'CLEANER', 1120, true, 'fec'),
  ('F&B', 'FB', 1130, true, 'fec'),
  ('F&B Manager', 'FB_MANAGER', 1140, true, 'fec'),
  ('F&B Supervisor', 'FB_SUPERVISOR', 1150, true, 'fec'),
  ('Head Chef', 'HEAD_CHEF', 1160, true, 'fec'),
  ('Barista', 'BARISTA', 1170, true, 'fec'),
  ('Chef', 'CHEF', 1180, true, 'fec'),
  ('F&B Cashier', 'FB_CASHIER', 1190, true, 'fec')
ON CONFLICT (name, audience) DO UPDATE SET
  code = EXCLUDED.code,
  sort_order = EXCLUDED.sort_order,
  active = true;

UPDATE public.master_departments child
SET parent_id = parent.id
FROM public.master_departments parent
WHERE parent.name = 'F&B'
  AND parent.audience = 'fec'
  AND child.audience = 'fec'
  AND child.name IN ('F&B Manager', 'F&B Supervisor', 'Head Chef', 'Barista', 'Chef', 'F&B Cashier');

DO $fec_reassign$
DECLARE
  rec record;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS fec_dept_reassign (
    staff_id uuid PRIMARY KEY,
    department_id uuid NOT NULL,
    target_name text NOT NULL
  ) ON COMMIT DROP;
  TRUNCATE fec_dept_reassign;

  INSERT INTO fec_dept_reassign (staff_id, department_id, target_name)
  SELECT s.id, md.id, mapped.target_name
  FROM public.staff s
  JOIN public.locations l ON l.id = s.location_id
  JOIN LATERAL (
    SELECT CASE
      WHEN keys.title_key = 'cashier'
        AND keys.dept_key IN ('f&b', 'f&b cafe', 'f&b operations') THEN 'F&B Cashier'
      ELSE map.target_name
    END AS target_name
    FROM (
      SELECT
        lower(regexp_replace(regexp_replace(trim(coalesce(s.job_title, '')), '\s*/\s*', ' / ', 'g'), '\s+', ' ', 'g')) AS title_key,
        lower(regexp_replace(trim(coalesce(s.department, '')), '\s+', ' ', 'g')) AS dept_key
    ) keys
    LEFT JOIN (
      VALUES
        ('managing director / chief executive officer', 'Managing Director / Chief Executive Officer'),
        ('general manager', 'General Manager'),
        ('fec operations', 'FEC Operations'),
        ('sr. site supervisor', 'Sr. Site Supervisor'),
        ('site supervisor', 'Site Supervisor'),
        ('venue supervisor', 'Site Supervisor'),
        ('av specialist / fec supervisor', 'AV Specialist / FEC Supervisor'),
        ('fec arcade technician', 'FEC Arcade Technician'),
        ('team leader', 'Team Leader'),
        ('crew / attendant', 'Crew / Attendant'),
        ('attendant', 'Crew / Attendant'),
        ('cashier', 'Cashier'),
        ('maintenance assistant / electrician', 'Maintenance Assistant / Electrician'),
        ('artist', 'Artist'),
        ('cleaner', 'Cleaner'),
        ('f&b', 'F&B'),
        ('f&b manager', 'F&B Manager'),
        ('f&b supervisor', 'F&B Supervisor'),
        ('head chef', 'Head Chef'),
        ('barista', 'Barista'),
        ('chef', 'Chef'),
        ('f&b cashier', 'F&B Cashier')
    ) AS map(title_key, target_name) ON map.title_key = keys.title_key
  ) mapped ON mapped.target_name IS NOT NULL
  JOIN public.master_departments md
    ON md.audience = 'fec' AND md.name = mapped.target_name
  WHERE s.deleted_at IS NULL
    AND l.code IS DISTINCT FROM 'HO'
  ON CONFLICT (staff_id) DO NOTHING;

  INSERT INTO fec_dept_reassign (staff_id, department_id, target_name)
  SELECT s.id, md.id, md.name
  FROM public.staff s
  JOIN public.locations l ON l.id = s.location_id
  JOIN public.master_departments md
    ON md.audience = 'fec'
   AND lower(md.name) = lower(regexp_replace(trim(coalesce(s.department, '')), '\s+', ' ', 'g'))
  WHERE s.deleted_at IS NULL
    AND l.code IS DISTINCT FROM 'HO'
    AND trim(coalesce(s.job_title, '')) = ''
    AND NOT EXISTS (SELECT 1 FROM fec_dept_reassign existing WHERE existing.staff_id = s.id)
  ON CONFLICT (staff_id) DO NOTHING;

  DELETE FROM public.staff_departments sd
  USING fec_dept_reassign mapped
  WHERE sd.staff_id = mapped.staff_id;

  INSERT INTO public.staff_departments (staff_id, department_id)
  SELECT staff_id, department_id FROM fec_dept_reassign
  ON CONFLICT DO NOTHING;

  FOR rec IN SELECT staff_id FROM fec_dept_reassign LOOP
    PERFORM public.sync_staff_department_display(rec.staff_id);
  END LOOP;
END
$fec_reassign$;

UPDATE public.master_departments md
SET active = false
WHERE md.audience = 'fec'
  AND md.name NOT IN (
    'Managing Director / Chief Executive Officer',
    'General Manager',
    'FEC Operations',
    'Sr. Site Supervisor',
    'Site Supervisor',
    'AV Specialist / FEC Supervisor',
    'FEC Arcade Technician',
    'Team Leader',
    'Crew / Attendant',
    'Cashier',
    'Maintenance Assistant / Electrician',
    'Artist',
    'Cleaner',
    'F&B',
    'F&B Manager',
    'F&B Supervisor',
    'Head Chef',
    'Barista',
    'Chef',
    'F&B Cashier'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.staff_departments sd
    JOIN public.staff s ON s.id = sd.staff_id
    WHERE sd.department_id = md.id
      AND s.deleted_at IS NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.staff s
    JOIN public.locations l ON l.id = s.location_id
    WHERE s.deleted_at IS NULL
      AND l.code IS DISTINCT FROM 'HO'
      AND lower(trim(coalesce(s.department, ''))) = lower(trim(md.name))
  );

CREATE OR REPLACE FUNCTION public.resolve_master_department_id(token text, p_audience text DEFAULT NULL)
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
    AND (p_audience IS NULL OR audience = p_audience)
  ORDER BY
    CASE WHEN p_audience IS NULL AND audience = 'fec' THEN 0 ELSE 1 END,
    active DESC,
    sort_order
  LIMIT 1;

  IF dept_id IS NOT NULL THEN
    RETURN dept_id;
  END IF;

  SELECT id INTO dept_id
  FROM public.master_departments
  WHERE lower(replace(name, ' ', '')) = lower(replace(cleaned, ' ', ''))
    AND (p_audience IS NULL OR audience = p_audience)
  ORDER BY
    CASE WHEN p_audience IS NULL AND audience = 'fec' THEN 0 ELSE 1 END,
    active DESC,
    sort_order
  LIMIT 1;

  RETURN dept_id;
END;
$$;
