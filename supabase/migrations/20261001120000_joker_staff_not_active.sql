-- Jokers are not active staff. Move employment-type joker rows that still
-- count as active onto status 'joker'. Leave leave / exit statuses unchanged.
-- staff.status is free text (no check constraint). Does not change RLS.

INSERT INTO public.staff_status_history (staff_id, from_status, to_status, effective_on, reason)
SELECT s.id, s.status, 'joker', CURRENT_DATE, 'joker_not_active_staff'
FROM public.staff s
WHERE s.deleted_at IS NULL
  AND s.employment_type IS NOT NULL
  AND lower(btrim(s.employment_type)) = 'joker'
  AND lower(btrim(s.status)) IN ('active', 'probation', 'secondment', 'remote');

UPDATE public.staff
SET status = 'joker'
WHERE deleted_at IS NULL
  AND employment_type IS NOT NULL
  AND lower(btrim(employment_type)) = 'joker'
  AND lower(btrim(status)) IN ('active', 'probation', 'secondment', 'remote');
