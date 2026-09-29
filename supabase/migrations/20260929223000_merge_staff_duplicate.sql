-- Move links from a duplicate staff row onto the kept row, fill empty fields, then delete the duplicate.
-- Identity matching lives in src/lib/staff-mapped-duplicates.ts. This function only relocates one pair.

CREATE OR REPLACE FUNCTION public.merge_staff_into(keep_id uuid, drop_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  fk record;
  idx record;
  colrec record;
  other_cols text[];
  assignments text;
  piece text;
  preds text;
  pred_d text;
  pred_k text;
  sql text;
  one_to_one_done boolean;
BEGIN
  IF keep_id IS NULL OR drop_id IS NULL OR keep_id = drop_id THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = drop_id) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = keep_id) THEN
    RAISE EXCEPTION 'merge_staff_into: kept staff % does not exist', keep_id;
  END IF;

  WITH src AS (
    SELECT *
    FROM public.staff
    WHERE id = drop_id
  ),
  cleared AS (
    UPDATE public.staff
    SET qid = NULL,
        user_id = NULL
    WHERE id = drop_id
    RETURNING id
  )
  UPDATE public.staff AS k
  SET
    job_title = CASE WHEN nullif(btrim(k.job_title), '') IS NULL THEN d.job_title ELSE k.job_title END,
    department = CASE WHEN nullif(btrim(k.department), '') IS NULL THEN d.department ELSE k.department END,
    phone = CASE WHEN nullif(btrim(k.phone), '') IS NULL THEN d.phone ELSE k.phone END,
    email = CASE WHEN nullif(btrim(k.email), '') IS NULL THEN d.email ELSE k.email END,
    qid = CASE WHEN nullif(btrim(k.qid), '') IS NULL THEN d.qid ELSE k.qid END,
    employment_type = CASE WHEN nullif(btrim(k.employment_type), '') IS NULL THEN d.employment_type ELSE k.employment_type END,
    hire_date = COALESCE(k.hire_date, d.hire_date),
    staff_role = COALESCE(k.staff_role, d.staff_role),
    e3_enrolled = COALESCE(k.e3_enrolled, d.e3_enrolled),
    user_id = COALESCE(k.user_id, d.user_id),
    source_row_no = COALESCE(k.source_row_no, d.source_row_no),
    reporting_time_minutes = COALESCE(k.reporting_time_minutes, d.reporting_time_minutes),
    buffer_minutes = COALESCE(k.buffer_minutes, d.buffer_minutes),
    flexible_shift_start = COALESCE(k.flexible_shift_start, d.flexible_shift_start),
    flexible_shift_end = COALESCE(k.flexible_shift_end, d.flexible_shift_end),
    expected_hours = COALESCE(k.expected_hours, d.expected_hours),
    break_minutes = COALESCE(k.break_minutes, d.break_minutes),
    weekly_off_weekday = COALESCE(k.weekly_off_weekday, d.weekly_off_weekday),
    photo_mime = CASE WHEN k.photo_data IS NULL THEN d.photo_mime ELSE k.photo_mime END,
    photo_updated_at = CASE WHEN k.photo_data IS NULL THEN d.photo_updated_at ELSE k.photo_updated_at END,
    photo_data = CASE WHEN k.photo_data IS NULL THEN d.photo_data ELSE k.photo_data END
  FROM src AS d
  WHERE k.id = keep_id
    AND EXISTS (SELECT 1 FROM cleared);

  FOR fk IN
    SELECT
      con.conrelid AS relid,
      n.nspname AS schema_name,
      c.relname AS table_name,
      a.attname AS column_name,
      a.attnum AS attnum
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = con.conkey[1]
    WHERE con.contype = 'f'
      AND con.confrelid = 'public.staff'::regclass
      AND cardinality(con.conkey) = 1
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  LOOP
    one_to_one_done := false;

    FOR idx IN
      SELECT i.indkey, i.indnkeyatts, pg_get_expr(i.indpred, i.indrelid) AS pred
      FROM pg_index i
      WHERE i.indrelid = fk.relid
        AND i.indisunique
        AND fk.attnum = ANY (i.indkey)
    LOOP
      IF 0 = ANY (idx.indkey) THEN
        RAISE EXCEPTION 'merge_staff_into: expression unique index on %.%', fk.schema_name, fk.table_name;
      END IF;

      SELECT COALESCE(array_agg(a.attname ORDER BY u.ord), ARRAY[]::text[])
      INTO other_cols
      FROM unnest(idx.indkey::smallint[]) WITH ORDINALITY AS u(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = fk.relid AND a.attnum = u.attnum
      WHERE u.ord <= idx.indnkeyatts
        AND u.attnum <> fk.attnum;

      IF cardinality(other_cols) = 0 AND idx.pred IS NULL AND NOT one_to_one_done THEN
        one_to_one_done := true;
        assignments := '';
        FOR colrec IN
          SELECT a.attname, t.typcategory
          FROM pg_attribute a
          JOIN pg_type t ON t.oid = a.atttypid
          WHERE a.attrelid = fk.relid
            AND a.attnum > 0
            AND NOT a.attisdropped
            AND a.attgenerated = ''
            AND a.attname <> fk.column_name
            AND a.attname NOT IN ('id', 'created_at', 'updated_at')
        LOOP
          IF colrec.typcategory = 'S' THEN
            piece := format(
              '%1$I = CASE WHEN nullif(btrim(k.%1$I), '''') IS NULL THEN d.%1$I ELSE k.%1$I END',
              colrec.attname
            );
          ELSE
            piece := format(
              '%1$I = CASE WHEN k.%1$I IS NULL THEN d.%1$I ELSE k.%1$I END',
              colrec.attname
            );
          END IF;
          IF assignments <> '' THEN
            assignments := assignments || ', ';
          END IF;
          assignments := assignments || piece;
        END LOOP;

        IF assignments <> '' THEN
          sql := 'UPDATE ' || quote_ident(fk.schema_name) || '.' || quote_ident(fk.table_name)
            || ' k SET ' || assignments
            || ' FROM ' || quote_ident(fk.schema_name) || '.' || quote_ident(fk.table_name)
            || ' d WHERE k.' || quote_ident(fk.column_name) || ' = $1 AND d.'
            || quote_ident(fk.column_name) || ' = $2';
          EXECUTE sql USING keep_id, drop_id;
        END IF;

        sql := 'DELETE FROM ' || quote_ident(fk.schema_name) || '.' || quote_ident(fk.table_name)
          || ' d WHERE d.' || quote_ident(fk.column_name)
          || ' = $1 AND EXISTS (SELECT 1 FROM ' || quote_ident(fk.schema_name) || '.'
          || quote_ident(fk.table_name) || ' k WHERE k.' || quote_ident(fk.column_name) || ' = $2)';
        EXECUTE sql USING drop_id, keep_id;
      END IF;
    END LOOP;

    FOR idx IN
      SELECT i.indkey, i.indnkeyatts, pg_get_expr(i.indpred, i.indrelid) AS pred
      FROM pg_index i
      WHERE i.indrelid = fk.relid
        AND i.indisunique
        AND fk.attnum = ANY (i.indkey)
    LOOP
      IF 0 = ANY (idx.indkey) THEN
        CONTINUE;
      END IF;

      SELECT COALESCE(array_agg(a.attname ORDER BY u.ord), ARRAY[]::text[])
      INTO other_cols
      FROM unnest(idx.indkey::smallint[]) WITH ORDINALITY AS u(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = fk.relid AND a.attnum = u.attnum
      WHERE u.ord <= idx.indnkeyatts
        AND u.attnum <> fk.attnum;

      IF cardinality(other_cols) = 0 AND idx.pred IS NULL THEN
        CONTINUE;
      END IF;

      preds := '';
      IF other_cols IS NOT NULL THEN
        FOREACH piece IN ARRAY other_cols LOOP
          preds := preds || ' AND d.' || quote_ident(piece) || ' IS NOT DISTINCT FROM k.' || quote_ident(piece);
        END LOOP;
      END IF;

      pred_d := NULL;
      pred_k := NULL;
      IF idx.pred IS NOT NULL THEN
        pred_d := idx.pred;
        pred_k := idx.pred;
        FOR colrec IN
          SELECT attname
          FROM pg_attribute
          WHERE attrelid = fk.relid
            AND attnum > 0
            AND NOT attisdropped
          ORDER BY length(attname) DESC
        LOOP
          pred_d := regexp_replace(pred_d, '\m' || colrec.attname || '\M', 'd.' || quote_ident(colrec.attname), 'g');
          pred_k := regexp_replace(pred_k, '\m' || colrec.attname || '\M', 'k.' || quote_ident(colrec.attname), 'g');
        END LOOP;
      END IF;

      sql := 'DELETE FROM ' || quote_ident(fk.schema_name) || '.' || quote_ident(fk.table_name)
        || ' d USING ' || quote_ident(fk.schema_name) || '.' || quote_ident(fk.table_name)
        || ' k WHERE d.ctid <> k.ctid AND d.' || quote_ident(fk.column_name)
        || ' = $1 AND k.' || quote_ident(fk.column_name) || ' = $2' || preds;
      IF pred_d IS NOT NULL THEN
        sql := sql || ' AND (' || pred_d || ') AND (' || pred_k || ')';
      END IF;
      EXECUTE sql USING drop_id, keep_id;
    END LOOP;

    sql := 'UPDATE ' || quote_ident(fk.schema_name) || '.' || quote_ident(fk.table_name)
      || ' SET ' || quote_ident(fk.column_name) || ' = $1 WHERE '
      || quote_ident(fk.column_name) || ' = $2';
    EXECUTE sql USING keep_id, drop_id;
  END LOOP;

  DELETE FROM public.staff WHERE id = drop_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.merge_staff_into(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_staff_into(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_staff_into(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
