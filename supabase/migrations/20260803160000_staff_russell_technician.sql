-- Ensure Russell exists as an active technician on the staff roster (UA-DM)
-- so AI Assist can resolve "send russel / russell" by name.
-- No auth login is created — when unmatched to a profile the form stores
-- requested_technician_name (persisted in remarks).

INSERT INTO public.staff (
  id,
  location_id,
  employee_code,
  full_name,
  job_title,
  department,
  hire_date,
  status,
  phone,
  staff_role,
  qid
)
SELECT
  'a8c3e5f1-9b2d-4e6a-8c1f-7d4b0a2e9f31'::uuid,
  l.id,
  '29958619901',
  'Russell Santos',
  'Technician',
  'Maintenance',
  CURRENT_DATE,
  'active',
  NULL,
  'technician'::public.staff_role,
  '29958619901'
FROM public.locations l
WHERE l.code = 'UA-DM'
  AND NOT EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.deleted_at IS NULL
      AND (
        s.id = 'a8c3e5f1-9b2d-4e6a-8c1f-7d4b0a2e9f31'::uuid
        OR lower(s.full_name) LIKE 'russell%'
        OR s.employee_code = '29958619901'
      )
  )
LIMIT 1;
