-- An employee can open a direct chat with the person they report to.
-- Peers who share that manager stay allowed. The manager's own staff row
-- does not share the employee's reporting_manager_staff_id.

CREATE OR REPLACE FUNCTION public.chat_shares_reporting_manager(_other_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff viewer
    JOIN public.staff_profile_ext viewer_ext ON viewer_ext.staff_id = viewer.id
    JOIN public.staff other ON other.user_id = _other_user_id
    LEFT JOIN public.staff_profile_ext other_ext ON other_ext.staff_id = other.id
    WHERE viewer.user_id = auth.uid()
      AND viewer.deleted_at IS NULL
      AND other.deleted_at IS NULL
      AND other.id <> viewer.id
      AND viewer_ext.reporting_manager_staff_id IS NOT NULL
      AND (
        other.id = viewer_ext.reporting_manager_staff_id
        OR other_ext.reporting_manager_staff_id = viewer_ext.reporting_manager_staff_id
      )
      AND COALESCE(lower(other.employment_type), '') <> 'joker'
      AND COALESCE(lower(replace(other.status, '-', '_')), 'active') IN ('', 'active', 'probation', 'secondment', 'remote')
  );
$$;

COMMENT ON FUNCTION public.chat_open_direct(uuid) IS
  'Opens one DIRECT conversation per user pair. Target must be a visible staff login, a teammate who shares the caller''s reporting manager, or that reporting manager.';
