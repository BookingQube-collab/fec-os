-- OT request numbers + one request batch per staff (multi-date stays one request).

ALTER TABLE public.hr_ot_claims
  ADD COLUMN IF NOT EXISTS request_number text;

COMMENT ON COLUMN public.hr_ot_claims.request_number IS
  'Human-facing OT request number shared by all day-rows in the same request_batch_id.';

CREATE INDEX IF NOT EXISTS idx_hr_ot_claims_request_number
  ON public.hr_ot_claims (request_number)
  WHERE request_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_ot_request_number()
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
  SELECT count(DISTINCT request_number) + 1 INTO seq
  FROM public.hr_ot_claims
  WHERE request_number LIKE 'OT-' || today || '-%';
  RETURN 'OT-' || today || '-' || lpad(seq::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_ot_request_number() TO authenticated, service_role;

-- Split any multi-staff batches so each person is one request (dates stay together).
WITH multi AS (
  SELECT request_batch_id
  FROM public.hr_ot_claims
  WHERE request_batch_id IS NOT NULL
  GROUP BY request_batch_id
  HAVING count(DISTINCT staff_id) > 1
),
keys AS (
  SELECT
    c.request_batch_id AS old_batch,
    c.staff_id,
    gen_random_uuid() AS new_batch
  FROM public.hr_ot_claims c
  INNER JOIN multi m ON m.request_batch_id = c.request_batch_id
  GROUP BY c.request_batch_id, c.staff_id
)
UPDATE public.hr_ot_claims c
SET request_batch_id = keys.new_batch
FROM keys
WHERE c.request_batch_id = keys.old_batch
  AND c.staff_id = keys.staff_id;

-- Rebuild supervisor batches that are still missing / singleton-only: one batch per
-- staff × submitter × submit second (covers multi-date day-rows from one submit).
WITH keys AS (
  SELECT
    staff_id,
    submitted_by,
    date_trunc('second', submitted_at) AS submitted_sec,
    gen_random_uuid() AS batch_id
  FROM public.hr_ot_claims
  WHERE claim_source = 'supervisor'
    AND submitted_by IS NOT NULL
    AND submitted_at IS NOT NULL
  GROUP BY staff_id, submitted_by, date_trunc('second', submitted_at)
  HAVING count(*) > 1
     OR bool_or(request_batch_id IS NULL)
     OR count(DISTINCT request_batch_id) > 1
)
UPDATE public.hr_ot_claims c
SET request_batch_id = keys.batch_id
FROM keys
WHERE c.claim_source = 'supervisor'
  AND c.submitted_by = keys.submitted_by
  AND c.staff_id = keys.staff_id
  AND date_trunc('second', c.submitted_at) = keys.submitted_sec;

-- Singleton supervisor rows still without a batch.
UPDATE public.hr_ot_claims
SET request_batch_id = id
WHERE claim_source = 'supervisor'
  AND request_batch_id IS NULL;

-- Attendance / unbatched day-rows: treat claim id as the request.
UPDATE public.hr_ot_claims
SET request_batch_id = id
WHERE request_batch_id IS NULL;

-- Assign one request number per batch (stable by submit day).
WITH ordered AS (
  SELECT
    request_batch_id,
    min(COALESCE(submitted_at, created_at)) AS sort_at,
    to_char(
      min(COALESCE(submitted_at, created_at)) AT TIME ZONE 'Asia/Qatar',
      'YYYYMMDD'
    ) AS day_key
  FROM public.hr_ot_claims
  WHERE request_batch_id IS NOT NULL
    AND request_number IS NULL
  GROUP BY request_batch_id
),
numbered AS (
  SELECT
    request_batch_id,
    'OT-' || day_key || '-' || lpad(
      (
        row_number() OVER (
          PARTITION BY day_key
          ORDER BY sort_at NULLS LAST, request_batch_id
        )
      )::text,
      4,
      '0'
    ) AS request_number
  FROM ordered
)
UPDATE public.hr_ot_claims c
SET request_number = n.request_number
FROM numbered n
WHERE c.request_batch_id = n.request_batch_id
  AND c.request_number IS NULL;
