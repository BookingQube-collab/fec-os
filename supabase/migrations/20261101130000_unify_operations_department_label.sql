-- Unify Operations naming: merge FEC Operations / legacy "fec operation(s)" into
-- the canonical Operations row (code OPS when present), refresh staff.department
-- display labels, and strip "fec op" branding prefixes from location names.
--
-- Safe for historical attendance: staff_id links stay; only department_id and
-- display text change. Does not alter RLS.

DO $ops_unify$
DECLARE
  ops_id uuid;
  fec_ops_id uuid;
  rec record;
  moved_links int := 0;
  renamed_masters int := 0;
  relabeled_staff int := 0;
  locations_cleaned int := 0;
BEGIN
  -- Prefer HO Operations (OPS). Fall back to any active Operations-named row.
  SELECT md.id
  INTO ops_id
  FROM public.master_departments md
  WHERE upper(btrim(coalesce(md.code, ''))) = 'OPS'
     OR trim(both FROM regexp_replace(lower(btrim(md.name)), '\s+', ' ', 'g')) IN (
       'operations', 'operation'
     )
  ORDER BY
    CASE WHEN upper(btrim(coalesce(md.code, ''))) = 'OPS' THEN 0 ELSE 1 END,
    CASE WHEN lower(btrim(md.name)) = 'operations' THEN 0 ELSE 1 END,
    CASE WHEN md.active THEN 0 ELSE 1 END,
    md.id
  LIMIT 1;

  IF ops_id IS NULL THEN
    RAISE NOTICE 'unify_operations: no Operations/OPS master row found — skipping merge';
    RETURN;
  END IF;

  -- Ensure canonical name/code on the keeper row.
  UPDATE public.master_departments
  SET name = 'Operations',
      code = coalesce(nullif(btrim(code), ''), 'OPS'),
      active = true
  WHERE id = ops_id
    AND (name IS DISTINCT FROM 'Operations' OR code IS DISTINCT FROM coalesce(nullif(btrim(code), ''), 'OPS'));

  -- Every other Operations alias master row (FEC_OPS, "fec operation", etc.).
  FOR rec IN
    SELECT md.id, md.name, md.code
    FROM public.master_departments md
    WHERE md.id <> ops_id
      AND (
        upper(btrim(coalesce(md.code, ''))) IN ('FEC_OPS', 'OPS', 'FEC OPS')
        OR trim(both FROM regexp_replace(lower(btrim(md.name)), '\s+', ' ', 'g')) IN (
          'operations',
          'operation',
          'fec operations',
          'fec operation',
          'fec ops',
          'fec op'
        )
      )
  LOOP
    -- Move staff links onto Operations (ignore conflicts when already linked).
    WITH moved AS (
      INSERT INTO public.staff_departments (staff_id, department_id)
      SELECT sd.staff_id, ops_id
      FROM public.staff_departments sd
      WHERE sd.department_id = rec.id
      ON CONFLICT DO NOTHING
      RETURNING staff_id
    )
    SELECT count(*) INTO moved_links FROM moved;

    DELETE FROM public.staff_departments
    WHERE department_id = rec.id;

    UPDATE public.master_departments
    SET active = false,
        name = CASE
          WHEN lower(btrim(name)) = 'operations' THEN name
          ELSE 'Operations (retired)'
        END
    WHERE id = rec.id;

    renamed_masters := renamed_masters + 1;
    fec_ops_id := rec.id;
  END LOOP;

  -- Refresh display labels for anyone still showing a legacy Operations spelling.
  FOR rec IN
    SELECT s.id
    FROM public.staff s
    WHERE s.deleted_at IS NULL
      AND (
        EXISTS (
          SELECT 1
          FROM public.staff_departments sd
          WHERE sd.staff_id = s.id
            AND sd.department_id = ops_id
        )
        OR trim(both FROM regexp_replace(lower(btrim(coalesce(s.department, ''))), '\s+', ' ', 'g')) IN (
          'fec operations',
          'fec operation',
          'fec ops',
          'fec op',
          'operation',
          'operations'
        )
        OR lower(coalesce(s.department, '')) LIKE '%fec operation%'
        OR lower(coalesce(s.department, '')) LIKE '%fec op%'
      )
  LOOP
    PERFORM public.sync_staff_department_display(rec.id);
    -- If they have no junction rows but free-text said Operations, force the label.
    UPDATE public.staff s
    SET department = 'Operations'
    WHERE s.id = rec.id
      AND NOT EXISTS (SELECT 1 FROM public.staff_departments sd WHERE sd.staff_id = s.id)
      AND trim(both FROM regexp_replace(lower(btrim(coalesce(s.department, ''))), '\s+', ' ', 'g')) IN (
        'fec operations',
        'fec operation',
        'fec ops',
        'fec op',
        'operation',
        'operations'
      );
    relabeled_staff := relabeled_staff + 1;
  END LOOP;

  -- Strip "fec op" / "FEC Operations" branding prefixes from location names.
  CREATE TEMP TABLE loc_cleaned (id uuid PRIMARY KEY, new_name text) ON COMMIT DROP;

  INSERT INTO loc_cleaned (id, new_name)
  SELECT
    l.id,
    nullif(
      btrim(
        regexp_replace(
          l.name,
          '^(?i)fec\s*op(eration)?s?\s*([-–—:/]|)\s*',
          '',
          'g'
        )
      ),
      ''
    )
  FROM public.locations l
  WHERE l.name ~* '^fec\s*op';

  UPDATE public.locations l
  SET name = coalesce(c.new_name, nullif(btrim(l.code), ''), 'Site')
  FROM loc_cleaned c
  WHERE l.id = c.id;

  SELECT count(*) INTO locations_cleaned FROM loc_cleaned;

  RAISE NOTICE 'unify_operations ops_id=% retired_masters=% staff_relabeled=% locations_cleaned=% (last_fec_ops=%)',
    ops_id, renamed_masters, relabeled_staff, locations_cleaned, fec_ops_id;
END
$ops_unify$;
