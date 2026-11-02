-- Cancel exact duplicate pending leave rows left by failed team-submit retries
-- (insert succeeded, approval-step seed hit RLS). Keep the earliest row per
-- staff + type + dates, then prevent the same shape from landing again.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY staff_id, leave_type, date_from, date_to
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.hr_leave_requests
  WHERE status = 'pending'
)
UPDATE public.hr_leave_requests r
SET
  status = 'cancelled',
  review_note = CASE
    WHEN r.review_note IS NULL OR btrim(r.review_note) = ''
      THEN 'Auto-cancelled duplicate pending leave'
    ELSE r.review_note || ' · Auto-cancelled duplicate pending leave'
  END,
  current_step_role = NULL,
  updated_at = now()
FROM ranked
WHERE r.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS hr_leave_requests_pending_exact_uidx
  ON public.hr_leave_requests (staff_id, leave_type, date_from, date_to)
  WHERE status = 'pending';
