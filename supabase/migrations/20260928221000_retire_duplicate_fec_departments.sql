-- Drop duplicate FEC activity rows that have no staff assignment.
-- The case-insensitive name check in the previous migration kept "Inflata park"
-- alive because a site employee is already on "INFLATA park".

UPDATE public.master_departments md
SET active = false
WHERE md.audience = 'fec'
  AND md.active = true
  AND md.name NOT IN (
    'Managing Director / Chief Executive Officer',
    'General Manager',
    'FEC Operations',
    'Sr. Site Supervisor',
    'Site Supervisor',
    'AV Specialist / FEC Supervisor',
    'FEC Arcade Technician',
    'Team Leader',
    'Crew / Attendant',
    'Cashier',
    'Maintenance Assistant / Electrician',
    'Artist',
    'Cleaner',
    'F&B',
    'F&B Manager',
    'F&B Supervisor',
    'Head Chef',
    'Barista',
    'Chef',
    'F&B Cashier'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.staff_departments sd
    JOIN public.staff s ON s.id = sd.staff_id
    WHERE sd.department_id = md.id
      AND s.deleted_at IS NULL
  );
