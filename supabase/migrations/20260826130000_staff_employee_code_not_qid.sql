-- employee_code is a unique internal staff key, never a QID copy.
-- Backfill numeric / QID-equal codes first, then enforce the check.

-- If QID is missing and the code column holds digits, keep that value as qid only.
UPDATE public.staff
SET qid = btrim(employee_code)
WHERE (qid IS NULL OR btrim(qid) = '')
  AND employee_code ~ '^\d{8,11}$';

CREATE OR REPLACE FUNCTION public.staff_next_employee_code(
  p_location_code text,
  p_staff_role text,
  p_job_title text
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  loc text := upper(nullif(btrim(p_location_code), ''));
  role text := lower(replace(coalesce(p_staff_role, ''), ' ', '_'));
  title text := lower(coalesce(p_job_title, ''));
  kind text;
  candidate text;
  n int;
BEGIN
  IF loc IS NULL THEN
    loc := 'UNK';
  END IF;

  IF role = 'venue_supervisor' OR title LIKE '%branch manager%' OR title LIKE '%venue supervisor%' THEN
    kind := 'BM';
  ELSIF role = 'cashier' OR title LIKE '%cashier%' THEN
    kind := 'CSH';
  ELSIF role = 'technician' OR title LIKE '%technician%' THEN
    kind := 'TEC';
  ELSE
    kind := 'STF';
  END IF;

  IF kind = 'BM' THEN
    candidate := loc || '-BM';
    IF NOT EXISTS (SELECT 1 FROM public.staff WHERE employee_code = candidate) THEN
      RETURN candidate;
    END IF;
    candidate := loc || '-VS';
    IF NOT EXISTS (SELECT 1 FROM public.staff WHERE employee_code = candidate) THEN
      RETURN candidate;
    END IF;
    n := 2;
    LOOP
      candidate := loc || '-BM' || n::text;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.staff WHERE employee_code = candidate);
      n := n + 1;
    END LOOP;
    RETURN candidate;
  END IF;

  IF kind = 'CSH' OR kind = 'TEC' THEN
    candidate := loc || '-' || kind;
    IF NOT EXISTS (SELECT 1 FROM public.staff WHERE employee_code = candidate) THEN
      RETURN candidate;
    END IF;
    n := 1;
    LOOP
      candidate := loc || '-' || kind || lpad(n::text, 2, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.staff WHERE employee_code = candidate);
      n := n + 1;
    END LOOP;
    RETURN candidate;
  END IF;

  n := 1;
  LOOP
    candidate := loc || '-STF' || lpad(n::text, 2, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.staff WHERE employee_code = candidate);
    n := n + 1;
  END LOOP;
  RETURN candidate;
END;
$$;

DO $$
DECLARE
  rec record;
  new_code text;
BEGIN
  FOR rec IN
    SELECT
      s.id,
      s.staff_role::text AS staff_role,
      s.job_title,
      coalesce(l.code, 'UNK') AS location_code
    FROM public.staff s
    LEFT JOIN public.locations l ON l.id = s.location_id
    WHERE s.employee_code IS NULL
       OR btrim(s.employee_code) = ''
       OR s.employee_code ~ '^\d+$'
       OR (s.qid IS NOT NULL AND btrim(s.qid) <> '' AND s.employee_code = s.qid)
    ORDER BY coalesce(l.code, 'UNK'), s.hire_date NULLS LAST, s.full_name, s.id
  LOOP
    new_code := public.staff_next_employee_code(rec.location_code, rec.staff_role, rec.job_title);
    UPDATE public.staff
    SET employee_code = new_code
    WHERE id = rec.id;
  END LOOP;
END;
$$;

DROP FUNCTION public.staff_next_employee_code(text, text, text);

ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_employee_code_not_qid_chk;
ALTER TABLE public.staff
  ADD CONSTRAINT staff_employee_code_not_qid_chk
  CHECK (qid IS NULL OR btrim(qid) = '' OR employee_code IS DISTINCT FROM qid);

ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_employee_code_not_numeric_chk;
ALTER TABLE public.staff
  ADD CONSTRAINT staff_employee_code_not_numeric_chk
  CHECK (employee_code IS NULL OR btrim(employee_code) = '' OR employee_code !~ '^\d{8,11}$');
