-- Human-facing request numbers for leave, job requisitions, and missed-punch corrections.
-- Style matches OT: PREFIX-YYYYMMDD-#### (Asia/Qatar calendar day).

-- ---------------------------------------------------------------------------
-- Leave
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_leave_requests
  ADD COLUMN IF NOT EXISTS request_number text;

COMMENT ON COLUMN public.hr_leave_requests.request_number IS
  'Human-facing leave request number (LV-YYYYMMDD-####).';

CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_request_number
  ON public.hr_leave_requests (request_number)
  WHERE request_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_leave_request_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq int;
  today text;
BEGIN
  today := to_char(now() AT TIME ZONE 'Asia/Qatar', 'YYYYMMDD');
  SELECT count(*) + 1 INTO seq
  FROM public.hr_leave_requests
  WHERE request_number LIKE 'LV-' || today || '-%';
  RETURN 'LV-' || today || '-' || lpad(seq::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_leave_request_number() TO authenticated, service_role;

WITH ordered AS (
  SELECT
    id,
    to_char(created_at AT TIME ZONE 'Asia/Qatar', 'YYYYMMDD') AS day_key,
    created_at
  FROM public.hr_leave_requests
  WHERE request_number IS NULL
),
numbered AS (
  SELECT
    id,
    'LV-' || day_key || '-' || lpad(
      (row_number() OVER (PARTITION BY day_key ORDER BY created_at, id))::text,
      4,
      '0'
    ) AS request_number
  FROM ordered
)
UPDATE public.hr_leave_requests r
SET request_number = n.request_number
FROM numbered n
WHERE r.id = n.id
  AND r.request_number IS NULL;

-- ---------------------------------------------------------------------------
-- Job requests (includes salary budget on the form when authorized)
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_job_requests
  ADD COLUMN IF NOT EXISTS request_number text;

COMMENT ON COLUMN public.hr_job_requests.request_number IS
  'Human-facing job request number (JR-YYYYMMDD-####).';

CREATE INDEX IF NOT EXISTS idx_hr_job_requests_request_number
  ON public.hr_job_requests (request_number)
  WHERE request_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_job_request_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq int;
  today text;
BEGIN
  today := to_char(now() AT TIME ZONE 'Asia/Qatar', 'YYYYMMDD');
  SELECT count(*) + 1 INTO seq
  FROM public.hr_job_requests
  WHERE request_number LIKE 'JR-' || today || '-%';
  RETURN 'JR-' || today || '-' || lpad(seq::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_job_request_number() TO authenticated, service_role;

WITH ordered AS (
  SELECT
    id,
    to_char(created_at AT TIME ZONE 'Asia/Qatar', 'YYYYMMDD') AS day_key,
    created_at
  FROM public.hr_job_requests
  WHERE request_number IS NULL
),
numbered AS (
  SELECT
    id,
    'JR-' || day_key || '-' || lpad(
      (row_number() OVER (PARTITION BY day_key ORDER BY created_at, id))::text,
      4,
      '0'
    ) AS request_number
  FROM ordered
)
UPDATE public.hr_job_requests r
SET request_number = n.request_number
FROM numbered n
WHERE r.id = n.id
  AND r.request_number IS NULL;

-- ---------------------------------------------------------------------------
-- Missed punch / attendance corrections
-- ---------------------------------------------------------------------------
ALTER TABLE public.attendance_corrections
  ADD COLUMN IF NOT EXISTS request_number text;

COMMENT ON COLUMN public.attendance_corrections.request_number IS
  'Human-facing missed-punch / correction request number (MP-YYYYMMDD-####).';

CREATE INDEX IF NOT EXISTS idx_attendance_corrections_request_number
  ON public.attendance_corrections (request_number)
  WHERE request_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_missed_punch_request_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq int;
  today text;
BEGIN
  today := to_char(now() AT TIME ZONE 'Asia/Qatar', 'YYYYMMDD');
  SELECT count(*) + 1 INTO seq
  FROM public.attendance_corrections
  WHERE request_number LIKE 'MP-' || today || '-%';
  RETURN 'MP-' || today || '-' || lpad(seq::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_missed_punch_request_number() TO authenticated, service_role;

WITH ordered AS (
  SELECT
    id,
    to_char(COALESCE(requested_at, now()) AT TIME ZONE 'Asia/Qatar', 'YYYYMMDD') AS day_key,
    COALESCE(requested_at, now()) AS sort_at
  FROM public.attendance_corrections
  WHERE request_number IS NULL
),
numbered AS (
  SELECT
    id,
    'MP-' || day_key || '-' || lpad(
      (row_number() OVER (PARTITION BY day_key ORDER BY sort_at, id))::text,
      4,
      '0'
    ) AS request_number
  FROM ordered
)
UPDATE public.attendance_corrections c
SET request_number = n.request_number
FROM numbered n
WHERE c.id = n.id
  AND c.request_number IS NULL;

NOTIFY pgrst, 'reload schema';
