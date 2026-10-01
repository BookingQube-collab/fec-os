-- One person, one staff row. Extra sites belong on staff_work_locations
-- (home stays staff.location_id). Duplicates are archived the same way as
-- deactivateStaff: status terminated and deleted_at set. Rows are not deleted,
-- so payroll and any attendance left on the duplicate stays in place.
--
-- Lilam Kumari Chaudhary (E3 masterfile Secondment, code S17, QID 29652445411,
-- Kids Driving School) is the keeper. Lilam Chaudry (KDS-CC-STF02, no QID) is
-- the same person and is archived. Both homes are KDS-CC, so no second site
-- is added.
--
-- Not merged (ambiguous): Mary Wangare Muiruri vs Mary Nyambura Muiruri share a
-- phone but have different QIDs. Ruben Yaralyan has two directory rows (HO code
-- 59 with a QID, and INF-CC-STF20 with no QID). Mohammed Abdalazeem appears on
-- the secondment sheet and the joker sheet; the joker line has no QID or phone.

DO $$
DECLARE
  keep uuid;
  dup uuid;
BEGIN
  SELECT s.id INTO keep
  FROM public.staff s
  WHERE s.deleted_at IS NULL
    AND s.full_name ILIKE '%lilam%'
    AND (s.employee_code = 'S17' OR s.qid = '29652445411')
  ORDER BY
    CASE WHEN s.employee_code = 'S17' AND s.qid = '29652445411' THEN 0 ELSE 1 END,
    s.created_at
  LIMIT 1;

  IF keep IS NULL THEN
    RETURN;
  END IF;

  SELECT s.id INTO dup
  FROM public.staff s
  WHERE s.id <> keep
    AND s.deleted_at IS NULL
    AND s.full_name ILIKE 'lilam%'
    AND (s.qid IS NULL OR btrim(s.qid) = '' OR s.qid = '29652445411')
  ORDER BY
    CASE WHEN s.employee_code = 'KDS-CC-STF02' THEN 0 ELSE 1 END,
    s.created_at
  LIMIT 1;

  IF dup IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.staff
  SET full_name = 'Lilam Kumari Chaudhary'
  WHERE id = keep
    AND full_name IS DISTINCT FROM 'Lilam Kumari Chaudhary';

  INSERT INTO public.staff_work_locations (staff_id, location_id)
  SELECT keep, src.location_id
  FROM (
    SELECT s.location_id
    FROM public.staff s
    WHERE s.id IN (keep, dup)
      AND s.location_id IS NOT NULL
    UNION
    SELECT w.location_id
    FROM public.staff_work_locations w
    WHERE w.staff_id IN (keep, dup)
  ) AS src
  ON CONFLICT (staff_id, location_id) DO NOTHING;

  UPDATE public.staff s
  SET is_roaming = EXISTS (
    SELECT 1
    FROM public.staff_work_locations w
    WHERE w.staff_id = s.id
      AND w.location_id IS DISTINCT FROM s.location_id
  )
  WHERE s.id = keep;

  -- Future device punches follow the keeper. Past rows move only when that
  -- does not collide with a row the keeper already has for the same day.
  UPDATE public.attendance_biometric_users
  SET staff_id = keep
  WHERE staff_id = dup;

  UPDATE public.attendance_logs
  SET staff_id = keep
  WHERE staff_id = dup;

  UPDATE public.attendance_daily_summary d
  SET
    staff_id = keep,
    subject_key = 'staff:' || keep::text
  WHERE d.staff_id = dup
    AND NOT EXISTS (
      SELECT 1
      FROM public.attendance_daily_summary k
      WHERE k.id <> d.id
        AND k.location_id = d.location_id
        AND k.work_date = d.work_date
        AND (
          k.staff_id = keep
          OR k.subject_key = 'staff:' || keep::text
        )
    );

  UPDATE public.attendance_roster_assignments d
  SET staff_id = keep
  WHERE d.staff_id = dup
    AND NOT EXISTS (
      SELECT 1
      FROM public.attendance_roster_assignments k
      WHERE k.staff_id = keep
        AND k.work_date = d.work_date
    );

  UPDATE public.staff
  SET
    status = 'terminated',
    deleted_at = COALESCE(deleted_at, now())
  WHERE id = dup
    AND deleted_at IS NULL;
END;
$$;
