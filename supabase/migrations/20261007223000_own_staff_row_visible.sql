-- My Day looks up staff by the signed-in user id. The staff select policy
-- only allowed rows at sites on the login. A manager whose home site is not
-- on that list saw "Account not linked to staff" even when staff.user_id matched.
-- Own row stays readable. Writes still require site access.

CREATE OR REPLACE FUNCTION public.user_can_access_staff(_staff_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.id = _staff_id
      AND (
        s.user_id = auth.uid()
        OR public.user_can_access_location(s.location_id)
        OR EXISTS (
          SELECT 1
          FROM public.staff_work_locations w
          WHERE w.staff_id = s.id
            AND public.user_can_access_location(w.location_id)
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.user_can_access_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_access_staff(uuid) TO authenticated, service_role;
