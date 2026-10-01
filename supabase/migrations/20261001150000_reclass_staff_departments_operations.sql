-- Put every current staff member on Operations, except people already stored
-- on the Maintenance team or the F&B team.
--
-- Department is the staff_departments junction (staff.department is the display
-- label, refreshed by sync_staff_department_display). Classification uses the
-- linked master department name/code, matching the org-focus helper:
--   Maintenance: code MAINT, or name Maintenance / Maintenace
--   F&B: code FB or FB_CAFE, or name F&B / F&B Cafe / FnB Cafe / F and B Cafe
-- Job-title catalog rows (Barista, Chef, F&B Manager, F&B Cashier, Head Chef,
-- Maintenance Assistant / Electrician, FEC Operations, F&B Operations, and so on)
-- are not those teams, so those people move to Operations.
-- A person linked to Operations and F&B (or Maintenance) keeps the exception
-- and drops Operations. Archived staff (deleted_at set) are left unchanged.
-- Uses the existing Operations row (code OPS). Does not insert another one.
-- Does not change RLS. No department-change history table exists for this.

DO $reclass$
DECLARE
  ops_id uuid;
  maint_id uuid;
  rec record;
  token text;
  token_norm text;
  token_code text;
  fb_id uuid;
  resolved_exception boolean;
  exception_links int;
  moved_n int;
  kept_fb int;
  kept_maint int;
  kept_both int;
  skipped_archived int;
  skipped_already_ops int;
  trimmed_exception int;
BEGIN
  CREATE TEMP TABLE dept_focus ON COMMIT DROP AS
  SELECT
    md.id,
    CASE
      WHEN upper(btrim(coalesce(md.code, ''))) = 'MAINT'
        OR trim(both FROM regexp_replace(
          regexp_replace(
            regexp_replace(lower(btrim(md.name)), '&', ' and ', 'g'),
            '\mfnb\M', 'f and b', 'g'
          ),
          '\s+', ' ', 'g'
        )) IN ('maintenance', 'maintenace') THEN 'maintenance'
      WHEN upper(btrim(coalesce(md.code, ''))) IN ('FB', 'FB_CAFE')
        OR trim(both FROM regexp_replace(
          regexp_replace(
            regexp_replace(lower(btrim(md.name)), '&', ' and ', 'g'),
            '\mfnb\M', 'f and b', 'g'
          ),
          '\s+', ' ', 'g'
        )) IN ('f and b', 'f and b cafe') THEN 'fb'
      WHEN upper(btrim(coalesce(md.code, ''))) = 'OPS'
        OR trim(both FROM regexp_replace(
          regexp_replace(
            regexp_replace(lower(btrim(md.name)), '&', ' and ', 'g'),
            '\mfnb\M', 'f and b', 'g'
          ),
          '\s+', ' ', 'g'
        )) IN ('operations', 'operation') THEN 'operations'
      ELSE 'other'
    END AS focus
  FROM public.master_departments md;

  SELECT md.id
  INTO ops_id
  FROM public.master_departments md
  JOIN dept_focus f ON f.id = md.id
  WHERE f.focus = 'operations'
  ORDER BY
    CASE WHEN upper(btrim(coalesce(md.code, ''))) = 'OPS' THEN 0 ELSE 1 END,
    CASE WHEN lower(btrim(md.name)) = 'operations' THEN 0 ELSE 1 END,
    md.id
  LIMIT 1;

  IF ops_id IS NULL THEN
    RAISE EXCEPTION 'Operations department (code OPS or name Operations) was not found';
  END IF;

  SELECT md.id
  INTO maint_id
  FROM public.master_departments md
  JOIN dept_focus f ON f.id = md.id
  WHERE f.focus = 'maintenance'
  ORDER BY
    CASE WHEN upper(btrim(coalesce(md.code, ''))) = 'MAINT' THEN 0 ELSE 1 END,
    CASE WHEN lower(btrim(md.name)) = 'maintenance' THEN 0 ELSE 1 END,
    md.id
  LIMIT 1;

  CREATE TEMP TABLE staff_dept_before ON COMMIT DROP AS
  SELECT sd.staff_id, sd.department_id
  FROM public.staff_departments sd
  JOIN public.staff s ON s.id = sd.staff_id
  WHERE s.deleted_at IS NULL;

  CREATE TEMP TABLE staff_dept_target (
    staff_id uuid NOT NULL,
    department_id uuid NOT NULL,
    PRIMARY KEY (staff_id, department_id)
  ) ON COMMIT DROP;

  FOR rec IN
    SELECT s.id AS staff_id, s.department, upper(btrim(coalesce(l.code, ''))) AS loc_code
    FROM public.staff s
    LEFT JOIN public.locations l ON l.id = s.location_id
    WHERE s.deleted_at IS NULL
  LOOP
    SELECT count(*)
    INTO exception_links
    FROM public.staff_departments sd
    JOIN dept_focus f ON f.id = sd.department_id
    WHERE sd.staff_id = rec.staff_id
      AND f.focus IN ('maintenance', 'fb');

    IF exception_links > 0 THEN
      INSERT INTO staff_dept_target (staff_id, department_id)
      SELECT rec.staff_id, sd.department_id
      FROM public.staff_departments sd
      JOIN dept_focus f ON f.id = sd.department_id
      WHERE sd.staff_id = rec.staff_id
        AND f.focus IN ('maintenance', 'fb')
      ON CONFLICT DO NOTHING;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.staff_departments sd WHERE sd.staff_id = rec.staff_id
    ) THEN
      INSERT INTO staff_dept_target (staff_id, department_id)
      VALUES (rec.staff_id, ops_id)
      ON CONFLICT DO NOTHING;
      CONTINUE;
    END IF;

    resolved_exception := false;

    FOR token IN
      SELECT btrim(tok)
      FROM unnest(regexp_split_to_array(coalesce(rec.department, ''), '[+,]')) AS tok
      WHERE btrim(tok) <> ''
    LOOP
      token_code := upper(btrim(token));
      token_norm := trim(both FROM regexp_replace(
        regexp_replace(
          regexp_replace(lower(btrim(token)), '&', ' and ', 'g'),
          '\mfnb\M', 'f and b', 'g'
        ),
        '\s+', ' ', 'g'
      ));

      IF token_code = 'MAINT' OR token_norm IN ('maintenance', 'maintenace') THEN
        IF maint_id IS NOT NULL THEN
          INSERT INTO staff_dept_target (staff_id, department_id)
          VALUES (rec.staff_id, maint_id)
          ON CONFLICT DO NOTHING;
          resolved_exception := true;
        END IF;
      ELSIF token_code IN ('FB', 'FB_CAFE') OR token_norm IN ('f and b', 'f and b cafe') THEN
        fb_id := NULL;
        SELECT md.id
        INTO fb_id
        FROM public.master_departments md
        JOIN dept_focus f ON f.id = md.id
        WHERE f.focus = 'fb'
          AND (
            (
              (token_norm = 'f and b cafe' OR token_code = 'FB_CAFE')
              AND (
                upper(btrim(coalesce(md.code, ''))) = 'FB_CAFE'
                OR trim(both FROM regexp_replace(
                  regexp_replace(
                    regexp_replace(lower(btrim(md.name)), '&', ' and ', 'g'),
                    '\mfnb\M', 'f and b', 'g'
                  ),
                  '\s+', ' ', 'g'
                )) = 'f and b cafe'
              )
            )
            OR (
              (token_norm = 'f and b' OR token_code = 'FB')
              AND token_norm <> 'f and b cafe'
              AND token_code <> 'FB_CAFE'
              AND (
                upper(btrim(coalesce(md.code, ''))) = 'FB'
                OR trim(both FROM regexp_replace(
                  regexp_replace(
                    regexp_replace(lower(btrim(md.name)), '&', ' and ', 'g'),
                    '\mfnb\M', 'f and b', 'g'
                  ),
                  '\s+', ' ', 'g'
                )) = 'f and b'
              )
              AND upper(btrim(coalesce(md.code, ''))) IS DISTINCT FROM 'FB_CAFE'
            )
          )
        ORDER BY
          CASE
            WHEN rec.loc_code = 'HO' AND md.audience = 'ho' THEN 0
            WHEN rec.loc_code <> 'HO' AND md.audience = 'fec' THEN 0
            ELSE 1
          END,
          CASE WHEN md.active THEN 0 ELSE 1 END,
          md.sort_order,
          md.id
        LIMIT 1;

        IF fb_id IS NOT NULL THEN
          INSERT INTO staff_dept_target (staff_id, department_id)
          VALUES (rec.staff_id, fb_id)
          ON CONFLICT DO NOTHING;
          resolved_exception := true;
        END IF;
      END IF;
    END LOOP;

    IF NOT resolved_exception THEN
      INSERT INTO staff_dept_target (staff_id, department_id)
      VALUES (rec.staff_id, ops_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  CREATE TEMP TABLE staff_dept_changed ON COMMIT DROP AS
  SELECT staff_id FROM (
    SELECT staff_id, department_id FROM staff_dept_target
    EXCEPT
    SELECT staff_id, department_id FROM staff_dept_before
  ) added
  UNION
  SELECT staff_id FROM (
    SELECT staff_id, department_id FROM staff_dept_before
    EXCEPT
    SELECT staff_id, department_id FROM staff_dept_target
  ) removed;

  DELETE FROM public.staff_departments sd
  USING staff_dept_changed c
  WHERE sd.staff_id = c.staff_id
    AND NOT EXISTS (
      SELECT 1
      FROM staff_dept_target t
      WHERE t.staff_id = sd.staff_id
        AND t.department_id = sd.department_id
    );

  INSERT INTO public.staff_departments (staff_id, department_id)
  SELECT t.staff_id, t.department_id
  FROM staff_dept_target t
  JOIN staff_dept_changed c ON c.staff_id = t.staff_id
  ON CONFLICT DO NOTHING;

  FOR rec IN SELECT staff_id FROM staff_dept_changed LOOP
    PERFORM public.sync_staff_department_display(rec.staff_id);
  END LOOP;

  SELECT count(*)
  INTO moved_n
  FROM staff_dept_changed c
  WHERE NOT EXISTS (
    SELECT 1
    FROM staff_dept_target t
    JOIN dept_focus f ON f.id = t.department_id
    WHERE t.staff_id = c.staff_id
      AND f.focus IN ('maintenance', 'fb')
  );

  SELECT count(DISTINCT t.staff_id)
  INTO kept_fb
  FROM staff_dept_target t
  JOIN dept_focus f ON f.id = t.department_id
  WHERE f.focus = 'fb';

  SELECT count(DISTINCT t.staff_id)
  INTO kept_maint
  FROM staff_dept_target t
  JOIN dept_focus f ON f.id = t.department_id
  WHERE f.focus = 'maintenance';

  SELECT count(*)
  INTO kept_both
  FROM (
    SELECT t.staff_id
    FROM staff_dept_target t
    JOIN dept_focus f ON f.id = t.department_id
    WHERE f.focus IN ('maintenance', 'fb')
    GROUP BY t.staff_id
    HAVING count(DISTINCT f.focus) = 2
  ) both_teams;

  SELECT count(*)
  INTO trimmed_exception
  FROM staff_dept_changed c
  WHERE EXISTS (
    SELECT 1
    FROM staff_dept_target t
    JOIN dept_focus f ON f.id = t.department_id
    WHERE t.staff_id = c.staff_id
      AND f.focus IN ('maintenance', 'fb')
  );

  SELECT count(*)
  INTO skipped_archived
  FROM public.staff
  WHERE deleted_at IS NOT NULL;

  SELECT count(*)
  INTO skipped_already_ops
  FROM public.staff s
  WHERE s.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM staff_dept_changed c WHERE c.staff_id = s.id)
    AND EXISTS (
      SELECT 1
      FROM staff_dept_target t
      WHERE t.staff_id = s.id
        AND t.department_id = ops_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM staff_dept_target t
      JOIN dept_focus f ON f.id = t.department_id
      WHERE t.staff_id = s.id
        AND f.focus IN ('maintenance', 'fb')
    );

  RAISE NOTICE 'reclass moved_to_operations=% kept_fb=% kept_maintenance=% kept_both=% trimmed_exception=% skipped_archived=% skipped_already_operations=%',
    moved_n, kept_fb, kept_maint, kept_both, trimmed_exception, skipped_archived, skipped_already_ops;
END
$reclass$;
