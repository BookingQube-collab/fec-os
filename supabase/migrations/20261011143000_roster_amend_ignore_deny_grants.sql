-- Monthly roster pencil, trash, and Delete all follow the code role list.
-- A saved Roles-page denial was hiding those controls from duty managers
-- and tech supervisors even though the capability defaults already allowed them.
DELETE FROM public.role_capability_grants
WHERE allowed = false
  AND capability IN (
    'people.edit_roster',
    'people.import_roster',
    'daily_ops.roster.upload'
  )
  AND role IN (
    'ceo',
    'coo',
    'regional_ops',
    'branch_gm',
    'duty_manager',
    'tech_supervisor',
    'hr'
  );
