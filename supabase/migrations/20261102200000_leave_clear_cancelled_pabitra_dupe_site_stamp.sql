-- Cancelled duplicate LV-20261102-0008 still listed on Mary's Approved history
-- because her site step stayed status=approved. Clear that stamp only; keep
-- LV-20261102-0002 (Mary site + real HoO Rajan Pathak) and its attendance row.

UPDATE public.hr_leave_approvals a
SET
  status = 'skipped',
  acted_by = NULL,
  acted_at = NULL,
  comments = CASE
    WHEN a.comments IS NULL OR btrim(a.comments) = ''
      THEN 'Cleared — duplicate leave cancelled (LV-20261102-0008)'
    ELSE a.comments || ' · Cleared — duplicate leave cancelled (LV-20261102-0008)'
  END
FROM public.hr_leave_requests r
WHERE a.leave_id = r.id
  AND r.request_number = 'LV-20261102-0008'
  AND r.status = 'cancelled'
  AND a.step_role = 'site'
  AND a.status = 'approved';
